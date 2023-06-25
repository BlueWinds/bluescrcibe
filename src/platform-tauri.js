import { invoke } from '@tauri-apps/api/tauri'
import { createDir, metadata, readDir, readBinaryFile, removeDir, removeFile } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'

// Emulate the parts of the metadata object that we use
class offlineMetadata {
  constructor(metadata) {
    this.metadata = metadata
  }

  async isDirectory() {
    return this.metadata.isDir
  }
}

const OfflineFS = {
  promises: {
    mkdir: createDir,
    async stat(path) {
      return new offlineMetadata(await metadata(path))
    },
    async readdir(path) {
      return (await readDir(path)).map((f) => f.name)
    },
    async readFile(path) {
      return Buffer.from(await readBinaryFile(path))
    },
    rmdir: removeDir,
    unlink: removeFile,
    // Workaround for https://github.com/tauri-apps/plugins-workspace/pull/454
    //   blocks using writeBinaryFile directly, so we essentially reimplement it
    // writeFile: writeBinaryFile,
    async writeFile(path, data) {
      if (typeof data === 'string') {
        data = new TextEncoder().encode(data)
      }
      if (typeof data === 'object') {
        data = Array.from(new Uint8Array(data))
      }
      await invoke('plugin:fs|write_file', {
        path: path,
        contents: data,
        options: undefined,
      })
    },
  },
}

const fs = Object.assign({}, OfflineFS)
const gameSystemPath = await join(await appConfigDir(), 'gameSystems')
const rosterPath = await join(await appConfigDir(), 'rosters')

const Platform = {
  fs,
  gameSystemPath,
  rosterPath,
}

export default Platform