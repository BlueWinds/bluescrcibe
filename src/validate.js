import _ from 'lodash'
import an from 'indefinite'
import pluralize from 'pluralize'

import { randomId } from './utils'

const arrayMerge = (dest, source) => {
  Object.entries(source).forEach(([key, value]) => {
    dest[key] = dest[key] || []
    dest[key].push(...value.sort())
  })
}

export const validateRoster = (roster, gameData) => {
  const errors = {}

  try {
    if (!roster.forces || roster.forces.force.length < 1) {
      errors[''] = ['A roster requires at least one Force.']
      return errors
    }

    gameData.gameSystem.categoryEntries.forEach(categoryEntry => {
      const entry = getEntry(roster, '', categoryEntry.id, gameData)
      arrayMerge(errors, checkConstraints(roster, '', entry, gameData))
    })

    roster.forces?.force.forEach((force, index) => {
      arrayMerge(errors, validateForce(roster, `forces.force.${index}`, force, gameData))
    })
  } catch (e) {
    e.location = 'roster'
    errors[''] = errors[''] || []
    errors[''].push(e)
  }

  return errors
}

const validateForce = (roster, path, force, gameData) => {
  const errors = {}

  try {
    gameData.gameSystem.entryLinks.forEach(entryLink => {
      const entry = getEntry(roster, path, entryLink.id, gameData)
      arrayMerge(errors, checkConstraints(roster, path, entry, gameData))
    })

    const catalogue = gameData.ids[force.catalogueId]
    catalogue.entryLinks?.forEach(selectionEntry => {
      const entry = getEntry(roster, path, selectionEntry.id, gameData)
      arrayMerge(errors, checkConstraints(roster, path, entry, gameData))
    })

    const f = gameData.ids[force.entryId]
    f.categoryLinks?.forEach(categoryLink => {
      const entry = getEntry(roster, path, categoryLink.id, gameData)
      arrayMerge(errors, checkConstraints(roster, path, entry, gameData))
    })

    force.selections?.selection.forEach((selection, index) => {
      arrayMerge(errors, validateSelection(roster, `${path}.selections.selection.${index}`, selection, gameData))
    })
  } catch (e) {
    e.path = path
    e.location = force.name
    errors[''] = errors[''] || []
    errors[''].push(e)
  }

  return errors
}

const validateSelection = (roster, path, selection, gameData) => {
  const errors = {}
  const entry = getEntry(roster, path, selection.entryId, gameData)

  try {
    if (entry.hidden) {
      arrayMerge(errors, {
        [path]: [`${selection.name} is hidden and cannot be selected.`],
      })
    }

    const handleLink = link => {
      const linkEntry = getEntry(roster, path, link.id, gameData)
      arrayMerge(errors, checkConstraints(roster, path, linkEntry, gameData))
    }

    const handleSelection = selectionEntry => {
      arrayMerge(errors, checkConstraints(roster, `${path}.selections.selection.100000`, selectionEntry, gameData, true))
    }

    const handleGroup = group => {
      if (group.hidden) {
        if (selection.selections?.selection.some(s => s.entryGroupId === group.id)) {
          arrayMerge(errors, {
            [path]: [`${group.name} is hidden and cannot be selected.`],
          })
        }
      }
      arrayMerge(errors, checkConstraints(roster, `${path}.selections.selection.100000`, group, gameData, true))

      group.entryLinks?.forEach(handleLink)
      group.selectionEntries?.forEach(handleSelection)
      group.selectionEntryGroups?.forEach(handleGroup)
    }

    entry.entryLinks?.forEach(handleLink)
    entry.selectionEntries?.forEach(handleSelection)
    entry.selectionEntryGroups?.forEach(handleGroup)

    selection.selections?.selection.forEach((selection, index) => {
      arrayMerge(errors, validateSelection(roster, `${path}.selections.selection.${index}`, selection, gameData))
    })

  } catch (e) {
    e.path = path
    e.location = selection.name
    errors[''] = errors[''] || []
    errors[''].push(e)
    console.log(e)
  }

  return errors
}

const hasCategory = (subject, categoryId) => {
  return !!subject.categories?.category.some(c => c.entryId.includes(categoryId))
}

const countBy = (subject, entryId, entry, groupIds) => {
  if (!subject) { debugger; throw new Error('No subject while trying to countBy') }
  if (entry.shared) {
    entryId = _.last(entryId.split('::'))
  }

  if (subject.entryId?.includes(entryId) || subject.entryGroupId?.includes(entryId) || groupIds?.some(groupId => subject.entryGroupId === groupId) || subject.type === entryId || hasCategory(subject, entryId)) {
    return subject.number ?? 1
  }

  let count = subject.forces?.force.filter(force => force.entryId === entryId ).length ?? 0

  if (subject.forces) {
    if (entry.includeChildForces || entry.shared) {
      count += _.sum(subject.forces.force.map(force => countBy(force, entryId, entry, groupIds)))
    }
  }

  if (subject.selections) {
    if (entry.includeChildSelections || entry.shared) {
      count += _.sum(subject.selections.selection.map(selection => countBy(selection, entryId, entry, groupIds)))
    } else {
      count += _.sum(_.map(subject.selections.selection.filter(selection => {
        return selection.entryId.includes(entryId) || selection.entryGroupId?.includes(entryId)
      }), 'number'))
    }
  }

  if (_.isNaN(count)) { debugger; throw new Error('NaN while trying to countBy') }
  return count
}

const countByCategory = (subject, category, entry) => {
  const categoryId = _.last(category.id.split('::'))

  let count = (!subject.catalogueId && subject.categories?.category.some(c => c.entryId === categoryId)) ?? 0

  if (entry.includeChildSelections && subject.selections) {
    count += _.sum(subject.selections.selection.map(selection => countByCategory(selection, category, entry)))
  } else {
    count += subject.selections?.selection.filter(selection => {
      return selection.categories?.category.some(c => c.entryId === categoryId)
    }).length ?? 0
  }

  return count
}

const sumCost = (subject, entry, filterByCategory) => {
  let sum = 0

  // If we're a top-level roster, don't include the "costs" or we'll end up double-counting.
  if (!subject.gameSystemId) {
    if (!filterByCategory || subject.categories?.category.some(c => c.entryId === filterByCategory)) {
      sum += subject.costs?.cost.find(c => c.id === entry.field)?.value
    }
  }

  if (entry.includeChildForces && subject.forces) {
    sum += subject.forces.force.map(force => sumCost(force, entry, filterByCategory))
  }

  if (entry.includeChildSelections && subject.selections) {
    sum += subject.selections.selection.map(selection => sumCost(selection, entry, filterByCategory))
  }

  return sum
}

const collectGroupIds = (entry, ids = []) => {
  entry.selectionEntryGroups?.forEach(group => {
    ids.push(group.id)
    collectGroupIds(group, ids)
  })
  return ids
}

const checkConstraints = (roster, path, entry, gameData, group = false) => {
  const errors = []

  try {
    const groupIds = collectGroupIds(entry)
    if (entry.constraints) {
      entry.constraints?.forEach(constraint => {
        const subject = getSubject(roster, path, constraint)
        const occurances = entry.primary === undefined ? countBy(subject, entry.id, constraint, groupIds) : countByCategory(subject, entry, constraint)
        const value = constraint.value * (subject.number ?? 1)

        if (constraint.type === 'min' && value !== -1 && !entry.hidden && occurances < value) {
          if (value === 1) {
            errors.push(`${subject.name} must have ${an(pluralize.singular(entry.name))} selection`)
          } else {
            errors.push(`${subject.name} must have ${value - occurances} more ${pluralize(entry.name)}`)
          }
        }
        if (constraint.type === 'max' && value !== -1 && occurances > value * (subject.number ?? 1)) {
          if (value === 0) {
            errors.push(`${subject.name} cannot have ${an(pluralize.singular(entry.name))} selection`)
          } else {
            errors.push(`${subject.name} must have ${occurances - value} fewer ${pluralize(entry.name)}`)
          }
        }
      })
    }
  } catch (e) {
    e.path = path
    e.location = entry.name
    return {'': [e]}
  }

  return errors.length ? {[path]: errors} : {}
}

const applyModifiers = (roster, path, entry, gameData) => {
  const ids = {}
  function index(x, path = '') {
    if (typeof x == "object") {
      if (x.id) {
        ids[x.id] = path
      }
      if (x.typeId) {
        ids[x.typeId] = path
      }

      for (let attr in x) { index(x[attr], `${path}.${attr}`) }
    }
  }
  index(entry)

  const applyModifier = (modifier) => {
    if (!checkConditions(roster, path, modifier, gameData)) { return }

    const target = entry[modifier.field] !== undefined ? modifier.field : `${ids[modifier.field]}.value`.slice(1)
    if (modifier.type === 'set') {
      if (_.isNaN(modifier.value)) { debugger; throw new Error('NaN modifier.value') }
      _.set(entry, target, modifier.value)
    } else if (modifier.type === 'increment' || modifier.type === 'decrement') {
      let times = 1
      if (modifier.repeats) {
        let repeat = modifier.repeats[0].repeats
        if (modifier.type === 'decrement') { repeat *= -1 }

        const subject = getSubject(roster, path, modifier.repeats[0])
        const value = subject ? countBy(subject, modifier.repeats[0].childId, modifier.repeats[0]) : 0
        const round = modifier.repeats[0].roundUp ? Math.ceil : Math.floor

        times = repeat * round(value / modifier.repeats[0].value)

      }

      _.set(entry, target, _.get(entry, target) + modifier.value * times)
    } else if (modifier.type === 'append') {
      entry[modifier.field] += modifier.value
    } else if (modifier.type === 'add') {
      if (modifier.field !== 'category') { debugger; throw new Error("modifier.type === 'add' while modifier.field !== 'category'") }

      entry.categoryLinks = entry.categoryLinks || []
      entry.categoryLinks.push({
        id: randomId(),
        hidden: false,
        name: 'New CategoryLink',
        primary: false,
        targetId: modifier.value,
      })
    } else if (modifier.type === 'remove') {
      if (modifier.field !== 'category') { debugger; throw new Error("modifier.type === 'remove' while modifier.field !== 'category'") }

      entry.categoryLinks = entry.categoryLinks.filter(link => link.targetId !== modifier.value)
    } else if (modifier.type === 'set-primary' || modifier.type === 'unset-primary') {
      if (modifier.field !== 'category') { debugger; throw new Error(`modifier.type === ${modifier.type} while modifier.field !== 'category'`) }
      let category = entry.categoryLinks.find(cat => cat.targetId === modifier.value)
      if (category) {
        category.primary = modifier.type === 'set-primary'
      } else { entry.categoryLinks.push({
        id: randomId(),
        hidden: false,
        name: 'New CategoryLink',
        primary: modifier.type === 'set-primary',
        targetId: modifier.value,
      })}
    } else {
      debugger
      throw new Error(`Unknown modifier.type: ${modifier.type}`)
    }
  }

  const applyModifierGroup = (group) => {
    if (!checkConditions(roster, path, group, gameData)) { return }
    group.modifiers?.forEach(applyModifier)
    group.modifierGroups?.forEach(applyModifierGroup)
  }

  entry.modifiers?.forEach(applyModifier)
  entry.modifierGroups?.forEach(applyModifierGroup)
}

const checkConditions = (roster, path, entry, gameData) => {
  const results = [
    ...(entry.conditions?.map(c => checkCondition(roster, path, c, gameData)) || []),
    ...(entry.conditionGroups?.map(cg => checkConditions(roster, path, cg, gameData)) || []),
  ]

  if (entry.type === 'or') {
    return results.some(Boolean)
  }

  // Not a group, or _type === 'and'
  return results.every(Boolean)
}

const findByEntryId = (subject, entryId) => {
  if (typeof subject === "object") {
    if (subject.entryId?.includes(entryId)) { return subject }
    for (let attr in subject) {
      const found = findByEntryId(subject[attr], entryId)
      if (found) { return found }
    }
  }
}

const pathToForce = path => path.replace(/forces.force.(\d+).*/, 'forces.force.$1')
export const pathParent = path => path.replace(/.selections.selection.\d+$/, '')
const pathAncestors = path => {
  const ancestors = [path]
  while (pathParent(path) !== path) {
    path = pathParent(path)
    ancestors.push(path)
  }
  return ancestors
}

const getSubject = (roster, path, condition) => {
  switch (condition.scope) {
    case 'self': return _.get(roster, path)
    case 'parent': return _.get(roster, pathParent(path))
    case 'force': return path.length ? _.get(roster, pathToForce(path)) : roster
    case 'roster': return roster
    case 'ancestor': return pathAncestors(path).map(ancestor => _.get(roster, ancestor))
    case 'primary-catalogue': return { entryId: _.get(roster, pathToForce(path) || 'forces.force.0')?.catalogueId }
    default: {
      const directAncestor = pathAncestors(path).find(startingPoint => _.get(roster, startingPoint)?.entryId?.includes(condition.scope))
      if (directAncestor) { return _.get(roster, directAncestor) }

      const startingPoint = condition.shared ? roster : _.get(roster, path)
      return findByEntryId(startingPoint, condition.scope)
    }
  }
}

const getValue = (condition, subject, gameData) => {
  const childId = gameData.ids[condition.childId]?.targetId || condition.childId

  if (!subject) { return NaN }
  switch (condition.field) {
    case 'selections': return subject.selections === undefined ? NaN : countBy(subject, childId, condition)
    case 'forces': return subject.forces === undefined ? NaN : countBy(subject, childId, condition)
    default: {
      let cost = sumCost(subject, condition, childId)
      if (condition.percentValue) {
        cost /= sumCost(subject, condition, false)
      }

      return cost
    }
  }
}

const checkCondition = (roster, path, condition, gameData) => {
  const subject = getSubject(roster, path, condition)

  switch (condition.type) {
    case 'greaterThan': return getValue(condition, subject, gameData) > condition.value
    case 'lessThan': return getValue(condition, subject, gameData) < condition.value
    case 'atMost': return getValue(condition, subject, gameData) <= condition.value
    case 'atLeast': return getValue(condition, subject, gameData) >= condition.value
    case 'equalTo': return getValue(condition, subject, gameData) === condition.value
    case 'notEqualTo': return getValue(condition, subject, gameData) !== condition.value
    case 'instanceOf': return [].concat(subject).filter(Boolean).some(s => s.entryId?.endsWith(condition.childId) || hasCategory(s, condition.childId))
    case 'notInstanceOf': return !([].concat(subject).filter(Boolean).some(s => s.entryId?.endsWith(condition.childId) || hasCategory(s, condition.childId)))
    default: { debugger; throw new Error('Unknown condition.type: ' + condition.type) }
  }
}

let lastRoster
let cache = {}
window.cacheHits = 0
window.cacheMisses = 0

export const getEntry = (roster, path, id, gameData, ignoreCache) => {
  const cachePath = `${path}-${id}`
  if (roster !== lastRoster) {
    cache = {}
    lastRoster = roster
  } else if (!ignoreCache && cache[cachePath]) {
    window.cacheHits++
    return cache[cachePath]
  }

  const entry = _.cloneDeep(gameData.ids[_.last(id.split('::'))])

  if (entry.targetId) {
    return getEntry(roster, path, `${id}::${entry.targetId}`, gameData, ignoreCache)
  }

  const baseId = id.split('::').slice(0, -1).join('::')

  const base = gameData.ids[_.last(baseId.split('::'))]
  if (base?.targetId === entry.id) {
    Object.keys(base).forEach(key => {
      if (entry[key] === undefined) {
        entry[key] = _.cloneDeep(base[key])
      } else if (entry[key] instanceof Array) {
        entry[key].push(..._.cloneDeep(base[key]))
      }
    })

    entry.hidden = base.hidden || entry.hidden
  }

  if (entry.modifiers || entry.modifierGroups) {
    applyModifiers(roster, path, entry, gameData)
  }

  entry.id = id

  entry.entryLinks?.forEach(link => {
    switch (link.type) {
      case 'selectionEntry': {
        entry.selectionEntries = entry.selectionEntries || []
        entry.selectionEntries.push(link)
        return
      }
      case 'selectionEntryGroup': {
        entry.selectionEntryGroups = entry.selectionEntryGroups || []
        entry.selectionEntryGroups.push(link)
        return
      }
      default: { debugger; throw new Error(`Unknown entryLink type: ${link.type}`) }
    }
  })
  delete entry.entryLinks

  const handleLink = link => {
    switch (link.type) {
      case 'profile': {
        entry.profiles = entry.profiles || []
        entry.profiles.push(link)
        return
      }
      case 'rule': {
        entry.rules = entry.rules || []
        entry.rules.push(link)
        return
      }
      case 'infoGroup': {
        link = getEntry(roster, path, `${baseId}::${link.id}`, gameData)

        link.profiles?.forEach(profile => {
          entry.profiles = entry.profiles || []
          entry.profiles.push(profile)
        })

        link.rules?.forEach(rule => {
          entry.rules = entry.rules || []
          entry.rules.push(rule)
        })

        return
      }
      default: { debugger; throw new Error(`Unknown infoLink type: ${link.type}`) }
    }
  }

  entry.infoLinks?.forEach(handleLink)
  delete entry.infoLinks

  entry.selectionEntries?.forEach((selectionEntry, index) => {
    Object.defineProperty(entry.selectionEntries, index, {
      get: () => getEntry(roster, `${path}.selections.selection.10000`, `${baseId}::${selectionEntry.id}`, gameData, ignoreCache)
    })
  })

  entry.selectionEntryGroups?.forEach((selectionEntryGroup, index) => {
    Object.defineProperty(entry.selectionEntryGroups, index, {
      get: () => getEntry(roster, path, `${baseId}::${selectionEntryGroup.id}`, gameData, ignoreCache)
    })
  })

  entry.profiles?.forEach((profile, index) => {
    Object.defineProperty(entry.profiles, index, {
      get: () => getEntry(roster, path, `${baseId}::${profile.id}`, gameData, ignoreCache)
    })
  })

  entry.rules?.forEach((rule, index) => {
    Object.defineProperty(entry.rules, index, {
      get: () => getEntry(roster, path, `${baseId}::${rule.id}`, gameData, ignoreCache)
    })
  })

  cache[cachePath] = entry

  window.cacheMisses++
  return entry
}