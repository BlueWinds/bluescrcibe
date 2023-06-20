import fxparser from 'fast-xml-parser'
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'
import _ from 'lodash'
import axios from 'axios'
import PQueue from 'p-queue'

import { parseXML } from 'bsd-schema'

export const readXML = async (path, fs) => {
  let buffer = await fs.promises.readFile(path)
  if (path.endsWith('z')) {
    const blob = new Blob([buffer])
    const zipFileReader = new BlobReader(blob)
    const zipReader = new ZipReader(zipFileReader)
    const firstEntry = (await zipReader.getEntries()).shift()
    const textWriter = new TextWriter()

    buffer = await firstEntry.getData(textWriter)

    await zipReader.close()
  }

  return parseXML(buffer.toString(), false)
}

const builder = new fxparser.XMLBuilder({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  format: true,
  indentBy: '  ',
  processEntities: true,
  suppressBooleanAttributes: false,
  suppressUnpairedNode: false,
  unpairedTags: [
    'publication',
    'category',
    'cost',
    'characteristic',
  ],
})

export const xmlData = async (contents, filename = '') => {
  contents = _.cloneDeep(contents)

  const prune = (target) => {
    Object.entries(target).forEach(([key, value]) => {
      if (typeof value === 'object') {
        if (Object.keys(value).length === 1 && value[Object.keys(value)[0]].length === 0) {
          delete target[key]
        } else {
          prune(value)
        }
      }
    })
  }

  prune(contents)

  let data = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + builder.build(contents)

  if (filename.endsWith('z')) {
    const zipFileWriter = new BlobWriter()
    const textReader = new TextReader(data)
    const zipWriter = new ZipWriter(zipFileWriter)
    await zipWriter.add(filename.replace(/z$/, ''), textReader)
    await zipWriter.close()
    const zipFileBlob = await zipFileWriter.getData()
    data = await zipFileBlob.arrayBuffer()
  }

  return data
}

export const listAvailableGameSystems = async () => {
  const data = await axios.get('https://corsproxy.io/?https://battlescribedata.appspot.com/repos')

  return data.data.repositories
}

export const listGameSystems = async (fs) => {
  const systems = {}
  const dirs = await fs.promises.readdir('/')
  await Promise.all(dirs.map(async dir => {
    try {
      systems[dir] = (await JSON.parse((await fs.promises.readFile('/' + dir + '/system.json')).toString()))
    } catch {
      await clearGameSystem({name: dir}, fs)
    }
  }))
  return systems
}

const htmlDecode = (str) => {
  const doc = new DOMParser().parseFromString(str, "text/html")
  return doc.documentElement.textContent
}

export const addLocalGameSystem = async (files, fs) => {
  const system = {
    name: files[0].webkitRelativePath.split(/\\|\//)[0],
    description: files[0].webkitRelativePath.split(/\\|\//)[0],
    lastUpdated: (new Date()).toISOString(),
    lastUpdateDescription: "Updated locally",
    version: "v0.0.0",
  }

  const dirs = await fs.promises.readdir('/')
  if (dirs.indexOf(system.name) !== -1) {
    const files = await fs.promises.readdir('/' + system.name)
    await Promise.all(files.map(f => fs.promises.unlink('/' + system.name + '/' + f)))
    await fs.promises.rmdir('/' + system.name)
  }

  await fs.promises.mkdir('/' + system.name)
  await fs.promises.writeFile('/' + system.name + '/system.json', JSON.stringify(system))

  await Promise.all(files.map(async file => {
    const filename = _.last(file.name.split(/\\|\//))
    const data = await file.arrayBuffer()
    console.log('Writing /' + system.name + '/' + filename, data)
    await fs.promises.writeFile('/' + system.name + '/' + filename, data)
  }))

  return system
}

export const addGameSystem = async (system, fs) => {
  const dirs = await fs.promises.readdir('/')
  if (dirs.indexOf(system.name) !== -1) {
    const files = await fs.promises.readdir('/' + system.name)
    await Promise.all(files.map(f => fs.promises.unlink('/' + system.name + '/' + f)))
    await fs.promises.rmdir('/' + system.name)
  }

  await fs.promises.mkdir('/' + system.name)
  await fs.promises.writeFile('/' + system.name + '/system.json', JSON.stringify(system))

  const index = await axios.get(`https://cdn.jsdelivr.net/gh/BSData/${system.name}@${system.version.replace('v', '')}/`)

  const files = (await index.data).match(/href="(.+\.(?:cat|gst))"/g).map(m => htmlDecode(m.replace('href="', '').slice(0, -1)))

  const q = new PQueue({ concurency: 3, throwOnTimeout: true, timeout: 60000, autostart: false })

  files.forEach(filename => q.add(async () => {
    const file = await axios(`https://cdn.jsdelivr.net${filename}`)
    await fs.promises.writeFile('/' + system.name + '/' + _.last(filename.split('/')), file.data)
  }))

  return q
}

export const clearGameSystem = async (system, fs) => {
  const files = await fs.promises.readdir('/' + system.name)
  await Promise.all(files.map(f => fs.promises.unlink('/' + system.name + '/' + f)))
  await fs.promises.rmdir('/' + system.name)
}

const listFiles = async (dir, fs) => {
  const files = await fs.promises.readdir(dir)
  const paths = files
    .filter(f => f.endsWith('.cat') || f.endsWith('.gst') || f.endsWith('.catz') || f.endsWith('.gstz'))
    .map(f => dir + '/' + f)

  return paths
}

const cacheVersion = 4

export const readFiles = async (dir, fs) => {
  try {
    if (await fs.promises.stat(dir + '/cache.json')) {
      console.log('Loading cache')
      const cache = JSON.parse(await fs.promises.readFile(dir + '/cache.json'))
      if (cache.gameSystem && cache.version === cacheVersion) {
        console.log(`Cache v${cacheVersion} looks valid`)
        return cache
      }
      console.log(cache.version !== cacheVersion ? `Found cache v${cache.version || 1}, wanted v${cacheVersion}. Reparsing raw files` : 'Read cache, but found no gameSystem. Reparsing raw files.')
    }
  } catch {
    console.log("No cache found. Reparsing raw files.")
  }

  const parsed = {
    version: cacheVersion,
    catalogues: {},
  }

  const paths = await listFiles(dir, fs)
  await Promise.all(paths.map(async (path) => {
    const data = await readXML(path, fs)
    data.ids = {}

    function index(x) {
      if (x.id) {
        data.ids[x.id] = x
      }

      delete x.import
      for (let attr in x) {
        if (x[attr] === '') { delete x[attr] }

        if (x[attr] instanceof Array) {
          x[attr].forEach(index)

          if (attr.startsWith('shared')) {
            delete x[attr]
          }
        }
      }
    }
    index(data)
    delete data.ids[data.id]

    if (data.type === 'gameSystem') { parsed.gameSystem = data }
    else if (data.type === 'catalogue') { parsed.catalogues[data.id] = data }
    else { throw new Error('Wut?') }
  }))

  try {
    await fs.promises.unlink(dir + '/cache.json')
  } catch {}

  await fs.promises.writeFile(dir + '/cache.json', JSON.stringify(parsed))

  return parsed
}

export const readRawFiles = async (dir, fs) => {
  const files = {}

  const paths = await listFiles(dir, fs)
  await Promise.all(paths.map(async (path) => {
    const data = await readXML(path, fs)
    const filename = _.last(path.split('/'))

    files[filename] = data

    if (data.type === 'gameSystem') {
      files.gameSystem = filename
    }
  }))

  return files
}