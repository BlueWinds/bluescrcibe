import { useEffect, useState } from 'react'
import BounceLoader from 'react-spinners/BounceLoader'
import useStorage from 'squirrel-gill'

import { listRosters, createRoster, loadRoster, importRoster, deleteRoster } from './repo/rosters'
import { validateRoster } from './validate'
import { useRoster, useSystem, RosterErrorsContext, useConfirm } from './Context'
import CostLimits from './CostLimits'
import Force from './Force/Force'
import AddForce from './Force/AddForce'
import BugReport from './BugReport'

const SelectRoster = () => {
  const [, setRoster] = useRoster()
  const [rosters, setRosters] = useState(null)
  const [selected, setSelected] = useStorage(localStorage, 'selectedRoster', '')
  const [newName, setNewFilename] = useState('NewRoster')
  const gameData = useSystem()
  const confirmDelete = useConfirm(true, `Delete ${selected}?`)

  useEffect(() => {
    const load = async () => {
      const r = await listRosters(gameData.gameSystem)
      setRosters(r)
      if (!r[selected]) { setSelected(Object.keys(r)[0] || 'New') }
      if (r[newName]) {
        let i = 1
        while (r['NewRoster' + i]) { i++ }
        setNewFilename('NewRoster' + i)
      }
    }

    if (!rosters && gameData) {
      load()
    }
  }, [rosters, gameData, newName, selected, setSelected])

  return <>
    <h2>Select Roster</h2>
    <p>To import a <code>.rosz</code> file, drop it anywhere on the page, or <span role="link" onClick={() => document.getElementById('import-roster').click()}>click here to select one</span>.</p>
    <input type="file" accept=".rosz" id="import-roster" onChange={async (e) => {
      await importRoster(e.target.files[0])
      setRosters(null)
    }} />
    {rosters ? <>
      <select onChange={e => setSelected(e.target.value)} value={selected}>
        {Object.entries(rosters).map(([roster, name]) => (<option key={roster} value={roster}>{roster} - {name}</option>))}
        <option key="new" value="New">New</option>
      </select>
      {selected === 'New' ? <>
          <label>
          Filename
          <input value={newName} onChange={e => setNewFilename(e.target.value)} />
        </label>
        <button onClick={async () => {
          const roster = await createRoster(newName, gameData.gameSystem)
          setRoster(roster)
        }}>Create <code>{newName}.rosz</code></button>
      </>: <>
        <button onClick={async () => { setRoster(await loadRoster(selected), false) }}>Load</button>
        <button className="secondary outline" onClick={() => confirmDelete(async () => {
          await deleteRoster(selected)
          setRosters(null)
        })}>Delete</button>
      </>}
    </>: <BounceLoader color="#36d7b7" className='loading' />}
  </>
}

const Roster = () => {
  const [roster] = useRoster()
  const gameData = useSystem()
  window.roster = roster

  if (!roster || !gameData) {
    return <SelectRoster />
  }

  const errors = validateRoster(roster, gameData)
  window.errors = errors

  return <RosterErrorsContext.Provider value={errors}><article>
    {errors[''] && <ul className="errors">{errors[''].map(e => <li key={e}>{e instanceof Error ? <BugReport error={e} />: e}</li>)}</ul>}
    <div>
      <CostLimits />
      {roster.forces?.force?.map((force, index) => <Force key={force._id} path={`forces.force.${index}`} />)}
      <AddForce />
    </div>
  </article></RosterErrorsContext.Provider>
}

export default Roster