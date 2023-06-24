import path from 'path'
import fs from 'fs'
import 'web-streams-polyfill/es2018'

import { validateRoster } from '../validate'
import { readFiles } from '../repo'
import { loadRoster } from '../repo/rosters'

describe('40k', () => {
  let gameData
  beforeAll(async () => {
    gameData = await readFiles(path.join(__dirname, 'downloadedGameSystems/wh40k'), fs)
  })

  const rosters = {
    '12AvatarKhaine.ros': {
      '': ['Ulthwe test warp must have a Warlord selection'],
      'forces.force.0': [
        'Battalion Detachment -3CP must have 3 more Troops',
        'Battalion Detachment -3CP must have 9 fewer HQS',
        'Battalion Detachment -3CP must have a Craftworld Selection selection',
        'Battalion Detachment -3CP must have a Detachment Command Cost selection',
        'Ulthwe test warp must have 11 fewer Avatar of Khaines',
        'Ulthwe test warp must have a Battle Size selection',
        'Ulthwe test warp must have a Game Type selection',
      ],
    },
    'AutarchWarlockSkyrunners.ros': {
      'forces.force.0': ['New Roster must have a Game Type selection'],
    },
    'CaptainPistol.ros': {
      'forces.force.0': ['CaptainPistol must have a Game Type selection'],
      'forces.force.0.selections.selection.3.selections.selection.2': [
        'Warlord does not exist in the game data. It may have been removed in a data update.',
      ],
    },
    'Chaos-Aeldari-CategoryConstraints.ros': {
      '': [
        'New Roster has 559pts, more than the limit of 5pts',
        'New Roster has 32PL, more than the limit of 5PL',
        'New Roster has 10CP, more than the limit of 5CP',
      ],
      'forces.force.0': [
        'New Roster must have a Game Type selection',
        'Patrol Detachment 0CP must have 1 fewer HQS',
        'Patrol Detachment 0CP must have a Troop selection',
      ],
      'forces.force.1': [
        'New Roster must have a Game Type selection',
        'Patrol Detachment -2CP must have 1 fewer Troops',
        'Patrol Detachment -2CP must have 1 more Troops',
        'Patrol Detachment -2CP must have an HQ selection',
      ],
    },
    'ChildForce.ros': {
      // TODO: support child forces
      'forces.force.0': ['New Roster must have a Game Type selection'],
    },
    'emptyForce.ros': {
      '': ['TS_duplicity_ca2022_v1 must have a Warlord selection'],
      'forces.force.0': [
        'Battalion Detachment -3CP must have 2 more HQS',
        'Battalion Detachment -3CP must have 3 more Troops',
        'Battalion Detachment -3CP must have a Cults of the Legion selection',
        'Battalion Detachment -3CP must have a Detachment Command Cost selection',
        'TS_duplicity_ca2022_v1 must have a Game Type selection',
      ],
    },
    'GenestealerHidden.ros': {
      'forces.force.0': ['New Roster must have a Game Type selection'],
      'forces.force.0.selections.selection.5.selections.selection.2': [
        'Proficient Planning: A Perfect Ambush is hidden and cannot be selected.',
      ],
    },
    'ghosthelm.ros': {
      // Battlescribe shows an error 'has two too many selections of Aspect Shrine Relic (max -2)' that we don't.
      // I've opted not to consider this a bug, because BlueScribe's behavior seems more correct?
      // If this causes actual problems, I'll add a more realistic test for this case.
      '': ['Ulthwe test warp must have a Warlord selection'],
      'forces.force.0': [
        'Battalion Detachment -3CP must have 1 more HQS',
        'Battalion Detachment -3CP must have 3 more Troops',
        'Battalion Detachment -3CP must have a Craftworld Selection selection',
        'Battalion Detachment -3CP must have a Detachment Command Cost selection',
        'Ulthwe test warp must have a Battle Size selection',
        'Ulthwe test warp must have a Game Type selection',
      ],
      'forces.force.0.selections.selection.0': [
        'Treasures of the Aeldari (Asuryani) is hidden and cannot be selected.',
      ],
      'forces.force.0.selections.selection.0.selections.selection.0': [
        'The Ghosthelm of Alishazier is hidden and cannot be selected.',
      ],
      'forces.force.0.selections.selection.0.selections.selection.0.selections.selection.100000': [
        'Ulthwe test warp cannot have a Treasures of the Aeldari Relic selection',
      ],
      'forces.force.0.selections.selection.0.selections.selection.100000': [
        'Farseer Skyrunner must have a Runes of Fortune selection',
        'Farseer Skyrunner must have a Shuriken Pistol selection',
        'Farseer Skyrunner must have a Smite selection',
        'Farseer Skyrunner must have a Twin Shuriken Catapult selection',
        'Farseer Skyrunner must have a Witch Weapon Option selection',
      ],
    },
    'GrimaldusLitanyNotInstanceof.ros': {
      // BattleScribe removes the 'Litanies of Hate (Aura)' selection because it has
      //   entryId: 'f8f8-4446-f539-cdeb::a42a-bdd6-b990-5c3f::a441-cc96-406f-0667'
      // while the correct value would be
      //   entryId: 'f8f8-4446-f539-cdeb::9c29-cf71-e7a5-7ac1::a441-cc96-406f-0667'

      // BlueScribe doesn't much care about the middle parts of the ID, caring only about the
      // last bit, which still matches, so we don't throw an error here.
      // If this causes an issue in practice (perhaps because the same entry is referenced multiple times?)
      // then we can look into it further.
      '': ['GrimaldusLitanyNotInstanceof must have a Warlord selection'],
      'forces.force.0': [
        'GrimaldusLitanyNotInstanceof must have a Game Type selection',
        'Patrol Detachment -2CP must have a Troop selection',
      ],
    },
    'hhhhhhhh.ros': {
      '': ['hhhhhhhh must have a Warlord selection'],
      'forces.force.0': [
        'Patrol Detachment -2CP must have a Detachment Command Cost selection',
        'Patrol Detachment -2CP must have a Troop selection',
        'hhhhhhhh must have a Battle Size selection',
        'hhhhhhhh must have a Game Type selection',
      ],
    },
    'MBH x EC.ros': {
      'forces.force.0': ['MBH x EC must have a Game Type selection'],
      'forces.force.1': ['MBH x EC must have a Game Type selection'],
      'forces.force.1.selections.selection.2': ['Furies is hidden and cannot be selected.'],
      'forces.force.2': ['MBH x EC must have a Game Type selection'],
      'forces.force.2.selections.selection.2': ['Gifts of Chaos (1 Relic) is hidden and cannot be selected.'],
      'forces.force.2.selections.selection.3.selections.selection.4': [
        'Raiment Revulsive does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.4.selections.selection.0.selections.selection.100000': [
        'Terminator Champion must have a Replace accursed weapon selection',
        'Terminator Champion must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.1.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.2.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.3.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.5': [
        'Icon of Excess does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.4.selections.selection.6.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.7.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.8.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.4.selections.selection.9.selections.selection.100000': [
        'Terminator must have a Replace accursed weapon selection',
        'Terminator must have a Replace combi-bolter selection',
      ],
      'forces.force.2.selections.selection.6.selections.selection.0.selections.selection.100000': [
        'Cultist Champion must have a Frag & Krak grenade selection',
      ],
      'forces.force.2.selections.selection.6.selections.selection.1.selections.selection.100000': [
        'Chaos Cultist w/ Autogun must have a Frag & Krak grenade selection',
      ],
      'forces.force.2.selections.selection.7.selections.selection.0.selections.selection.100000': [
        'Chosen Champion must have a Frag & Krak grenade selection',
        'Chosen Champion must have a Replace bolt pistol selection',
        'Chosen Champion must have a Replace boltgun selection',
        'Chosen Champion must have an Accursed weapon selection',
      ],
      'forces.force.2.selections.selection.7.selections.selection.1': [
        'Chosen does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.10': [
        'Chosen w/ lightning claw does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.100000': ['Chosen must have 5 more Chosens'],
      'forces.force.2.selections.selection.7.selections.selection.2': [
        'Chosen does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.3': [
        'Chosen does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.4': [
        'Chosen does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.6': [
        'Icon of Excess does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.7': [
        'Chosen w/ lightning claw does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.8': [
        'Chosen w/ lightning claw does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.2.selections.selection.7.selections.selection.9': [
        'Chosen w/ lightning claw does not exist in the game data. It may have been removed in a data update.',
      ],
      'forces.force.3': ['MBH x EC must have a Game Type selection'],
      'forces.force.3.selections.selection.0.selections.selection.100000': [
        'Mortarion must have a 1. Revoltingly Resilient selection',
        'Mortarion must have a 2. Living Plague selection',
        'Mortarion must have a 4. Arch-Contaminator selection',
      ],
    },
    // 'rfffff.ros': {},
    // 'Terminator.ros': {},
    // 'Test admec.ros': {},
    // 'Test_eldar.ros': {},
    // 'Testts.ros': {},
    // 'TS_duplicity_ca2022_v1.ros': {},
    // 'TS_duplicity_ca2022_v2.ros': {},
    // 'TS_duplicity_ca2022_v3.ros': {},
    // 'TS_duplicity_ca2022_v5.ros': {},
    // 'TS_duplicity_magnus_v1.ros': {},
    // 'TSKCA2022V6.ros': {},
    // 'Ulthwe test warp.ros': {},
  }

  Object.entries(rosters).forEach(([roster, expectedErrors]) => {
    it(`should validate ${roster}`, async () => {
      const file = await loadRoster(roster, fs, path.join(__dirname, 'bsrosters/wh40k'))
      const errors = validateRoster(file, gameData)

      expect(errors).toEqual(expectedErrors)
    })
  })
})
