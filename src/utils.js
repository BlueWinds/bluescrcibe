import _ from 'lodash'

import { getEntry } from './validate'

export const randomId = () => {
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const hex4 = () => hex() + hex() + hex() + hex()
  return `${hex4()}-${hex4()}-${hex4()}-${hex4()}`
}

export const sumCosts = (entry, costs = {}) => {
  (entry.costs?.cost || entry.costs)?.forEach(c => {
    if (c.value !== 0) {
      costs[c.name] = (costs[c.name] | 0) + c.value
    }
  })
  entry.selections?.selection.forEach(selection => {
    sumCosts(selection, costs)
  })

  return costs
}

export const selectionName = selection => `${selection.customName ? selection.customName + ' - ' : ''}${selection.number > 1 ? `${selection.number}x ` : ''}${selection.name}`
export const costString = costs => Object.keys(costs).filter(c => costs[c]).sort().map(name => `${costs[name]} ${name}`).join(', ')

export const textProfile = profiles => {
  const a = Object.entries(profiles).map(([name, profileList]) => {
    return `<div>
      <table>
        <thead>
          <th>${name}</th>
          ${profileList[0][1].characteristics.map(c => `<th>${c.name}</th>`).join('\n')}
        </thead>
        <tbody>
          ${profileList.map(([number, profile]) => `<tr>
            <td>${number > 1 ? `x${number} ` : ''}${profile.name}</td>
            ${profile.characteristics.map(c => `<td>${c['#text']}</td>`).join('\n')}
          </tr>`).join('\n')}
        </tbody>
      </table>
    </div>`
  }).join('\n') || null
  return a
}

export const getMinCount = (entry) => (!entry.hidden && entry.constraints?.find(c => c.type === 'min' && c.scope === 'parent')?.value) ?? 0
export const getMaxCount = (entry) => entry.constraints?.find(c => c.type === 'max' && c.scope === 'parent')?.value ?? -1
export const isCollective = (entry) => entry.collective || entry.selectionEntries?.every(isCollective)

export const createRoster = (name, gameSystem) => {
  const roster = {
    id: randomId(),
    name: name,
    battleScribeVersion: "2.03",
    gameSystemId: gameSystem.id,
    gameSystemName: gameSystem.name,
    gameSystemRevision: gameSystem.revision,
    xmlns: "http://www.battlescribe.net/schema/rosterSchema",
    __: {
      filename: name + '.rosz',
      updated: true,
    }
  }

  return roster
}

export const addForce = (roster, forceId, factionId, gameData) => {
  roster.forces = roster.forces || {force: []}
  roster.forces.force.push({
    id: randomId(),
    name: gameData.ids[forceId].name,
    entryId: forceId,
    catalogueId: factionId,
    catalogueRevision: gameData.ids[factionId].revision,
    catalogueName: gameData.ids[factionId].name,
    publications: {
      publication: [
        ...(gameData.ids[factionId].publications || []).map(p => _.pick(p, ['id', 'name'])),
        ...(gameData.gameSystem.publications || []).map(p => _.pick(p, ['id', 'name'])),
        ...(_.flatten(gameData.ids[factionId].catalogueLinks?.map(cl => gameData.ids[cl.targetId].publications || []))).map(p => _.pick(p, ['id', 'name'])),
      ]
    },
    categories: {
      category: [
        {
          id: randomId(),
          name: "Uncategorised",
          entryId: "(No Category)",
          primary: "false",
        },
        ...gameData.ids[forceId].categoryLinks.map(c => ({
          id: c.id,
          name: c.name,
          entryId: c.targetId,
          primary: "false",
        }))
      ]
    }
  })
}

export const addSelection = (base, selectionEntry, gameData, entryGroup, number = 1) => {
  base.selections = base.selections || {selection: []}
  const collective = isCollective(selectionEntry)

  const newSelection = _.omitBy({
    id: randomId(),
    name: selectionEntry.name,
    entryId: selectionEntry.id,
    number: collective ? number : 1,
    page: selectionEntry.page,
    publicationId: selectionEntry.publicationId,
    type: selectionEntry.type,
    categories: {category: []},
    costs: {cost: _.cloneDeep(selectionEntry.costs)},
    profiles: {profile: []},
    rules: {rule: []},
  }, _.isUndefined)

  newSelection.costs.cost.forEach(c => {
    c.value *= newSelection.number
  })

  if (entryGroup) {
    if (getMaxCount(entryGroup) === 1) {
      base.selections.selection = base.selections.selection.filter(s => !s.entryGroupId?.endsWith(entryGroup.id))
    }

    newSelection.entryGroupId = entryGroup.id
  }

  addCategories(newSelection, selectionEntry, gameData)
  addProfiles(newSelection, selectionEntry)
  addRules(newSelection, selectionEntry)

  selectionEntry.selectionEntries?.forEach(selection => {
    const min = getMinCount(selection)
    if (min) {
      addSelection(newSelection, selection, gameData, null, collective ? min * number : min)
    }
  })

  const handleGroup = entryGroup => {
    entryGroup.selectionEntries?.forEach(selection => {
      let min = getMinCount(selection)

      if (min) {
        addSelection(newSelection, selection, gameData, entryGroup, collective ? min : min * number)
      } else if (getMinCount(entryGroup) && entryGroup.defaultSelectionEntryId && selection.id.includes(entryGroup.defaultSelectionEntryId)) {
        min = getMinCount(entryGroup)
        addSelection(newSelection, selection, gameData, entryGroup, collective ? min : min * number)
      }
    })

    entryGroup.selectionEntryGroups?.forEach(handleGroup)
  }

  selectionEntry.selectionEntryGroups?.forEach(handleGroup)

  base.selections.selection.push(newSelection)
  if (!collective && number > 1) {
    addSelection(base, selectionEntry, gameData, entryGroup, number - 1)
  }
}

const addCategories = (selection, selectionEntry, gameData) => {
  selection.categories.category.push(...(selectionEntry.categoryLinks || []).map(c => ({
    id: randomId(),
    name: gameData.ids[c.targetId].name,
    entryId: c.targetId,
    primary: c.primary,
  })))
}

const addProfiles = (selection, selectionEntry) => {
  selection.profiles.profile.push(...(selectionEntry.profiles || []).map(profile => ({
    id: profile.id,
    name: profile.name,
    hidden: profile.hidden,
    typeId: profile.typeId,
    typeName: profile.typeName,
    publicationId: profile.publicationId,
    page: profile.page,
    characteristics: {characteristic: profile.characteristics},
  })))
}

const addRules = (selection, selectionEntry) => {
  selection.rules.rule.push(...(selectionEntry.rules || []).map(rule => ({
    id: rule.id,
    name: rule.name,
    hidden: rule.hidden,
    publicationId: rule.publicationId,
    page: rule.page,
    description: rule.description,
  })))
}

export const refreshSelection = (roster, path, selection, gameData) => {
  const selectionEntry = getEntry(roster, path, selection.entryId, gameData, true)

  _.assign(selection, {
    name: selectionEntry.name,
    type: selectionEntry.type,
    categories: {category: []},
    costs: {cost: _.cloneDeep(selectionEntry.costs)},
    profiles: {profile: []},
    rules: {rule: []},
  })

  selection.costs.cost.forEach(c => {
    c.value *= selection.number
  })

  addCategories(selection, selectionEntry, gameData)
  addProfiles(selection, selectionEntry, gameData)
  addRules(selection, selectionEntry, gameData)

  selection.selections?.selection.forEach((subSelection, index) => refreshSelection(roster, `${path}.selections.selection.${index}`, subSelection, gameData))
}

export const refreshRoster = (roster, gameData) => {
  const newRoster = createRoster(roster.name, gameData.gameSystem)
  newRoster.__.filename = roster.__.filename
  newRoster.costLimits = roster.costLimits
  newRoster.customNotes = roster.customNotes

  roster.forces.force.forEach((force, index) => {
    addForce(newRoster, force.entryId, force.catalogueId, gameData)
    newRoster.forces.force[index].selections = {selection: []}

    force.selections.selection.forEach((selection, selectionIndex) => {
      newRoster.forces.force[index].selections.selection.push(selection)
      refreshSelection(newRoster, `forces.force.${index}.selections.selection.${selectionIndex}`, selection, gameData)
    })
  })

  return newRoster
}

export const copySelection = (selection) => {
  const copy = _.cloneDeep(selection)

  function reId(x) {
    if (x.id) {
      x.id = randomId()
    }

    for (let attr in x) {
      if (typeof x[attr] === 'object') { reId(x[attr]) }
    }
  }

  reId(copy)
  return copy
}