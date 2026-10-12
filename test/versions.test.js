const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  minJavaFor, compareVersions, slugify,
  parseVersionManifest, parseVersionJsonServer, parsePaperProjects, parsePaperBuilds, parseFabricGameVersions,
  parseForgePromotions, forgeArgsRelPath, normalizeVersions
} = require('../main/versions')

test('minJavaFor mapea los umbrales de Java por versión', () => {
  assert.equal(minJavaFor('1.16.5'), 8)
  assert.equal(minJavaFor('1.17'), 17)
  assert.equal(minJavaFor('1.20.4'), 17)
  assert.equal(minJavaFor('1.20.5'), 21)
  assert.equal(minJavaFor('1.21'), 21)
  assert.equal(minJavaFor('1.21.8'), 21)
  assert.equal(minJavaFor('26.3'), 21)
  assert.equal(minJavaFor('nope'), null)
  assert.equal(minJavaFor(''), null)
})

test('compareVersions ordena numéricamente y sitúa los pre-releases después', () => {
  assert.ok(compareVersions('1.21.8', '1.21.11') < 0)
  assert.ok(compareVersions('1.20.4', '1.20.5') < 0)
  assert.ok(compareVersions('1.20.1', '1.20') > 0)
  assert.ok(compareVersions('1.21.11', '1.21.11-rc1') > 0)
  assert.equal(compareVersions('1.21.8', '1.21.8'), 0)
})

test('slugify limpia caracteres inválidos y aplica fallback', () => {
  assert.equal(slugify('Mi "server": survival?/test'), 'Mi _server_ survival_test')
  assert.equal(slugify('   '), 'server')
  assert.equal(slugify('a'.repeat(100)).length, 60)
})

test('parseVersionManifest filtra releases y ordena de más nueva a más antigua', () => {
  const json = {
    latest: { release: '1.21.8', snapshot: '25w01a' },
    versions: [
      { id: '1.21.8', type: 'release', url: 'u1', releaseTime: '2025-01-01' },
      { id: '1.21.9-rc1', type: 'snapshot', url: 'u2' },
      { id: '1.20.1', type: 'release', url: 'u3' },
      { id: '1.21', type: 'release', url: 'u4' }
    ]
  }
  const { latest, releases } = parseVersionManifest(json)
  assert.equal(latest, '1.21.8')
  assert.deepEqual(releases.map(r => r.id), ['1.21.8', '1.21', '1.20.1'])
})

test('parseVersionJsonServer extrae la URL del servidor o null', () => {
  assert.equal(parseVersionJsonServer({ downloads: { server: { url: 'https://x/server.jar' } } }), 'https://x/server.jar')
  assert.equal(parseVersionJsonServer({ downloads: {} }), null)
  assert.equal(parseVersionJsonServer(null), null)
})

test('parsePaperProjects lista versiones estables ordenadas y sin pre-releases', () => {
  const json = { versions: { '26.3': ['26.3', '26.3-rc-3'], '1.21': ['1.21.11', '1.21.11-rc3', '1.21'] } }
  const list = parsePaperProjects(json)
  assert.equal(list[0], '26.3')
  assert.ok(list.includes('1.21.11'))
  assert.ok(!list.some(v => v.includes('-')))
})

test('parsePaperBuilds devuelve el primer build estable con descarga', () => {
  const json = [
    { id: 61, channel: 'ALPHA', downloads: { 'server:default': { url: 'https://a.jar' } } },
    {
      id: 60,
      channel: 'STABLE',
      time: '2025-09-06T21:50:11.982Z',
      downloads: { 'server:default': { name: 'paper-1.21.8-60.jar', url: 'https://fill-data/x.jar', checksums: { sha256: 'abc' }, size: 42 } }
    }
  ]
  const b = parsePaperBuilds(json)
  assert.equal(b.url, 'https://fill-data/x.jar')
  assert.equal(b.sha256, 'abc')
  assert.equal(b.build, 60)
  assert.equal(parsePaperBuilds([{ id: 1, channel: 'ALPHA' }]), null)
})

test('parseFabricGameVersions conserva solo estables y ordena de más nueva a más antigua', () => {
  const json = [
    { version: '1.21.8', stable: true },
    { version: '1.21.9-pre1', stable: false },
    { version: '1.21.11', stable: true },
    { version: '1.20.1', stable: true }
  ]
  const list = parseFabricGameVersions(json)
  assert.deepEqual(list.map(v => v.id), ['1.21.11', '1.21.8', '1.20.1'])
  assert.deepEqual(parseFabricGameVersions(null), [])
})

test('parseForgePromotions agrupa por MC, prefiere recommended y filtra <1.17', () => {
  const json = {
    promos: {
      '1.20.1-recommended': '47.2.0',
      '1.20.1-latest': '47.3.0',
      '1.16.5-recommended': '36.2.34',
      '1.19.2-recommended': '43.2.0',
      '1.20.1-beta': '47.1.0'
    }
  }
  const list = parseForgePromotions(json)
  assert.deepEqual(list.map(v => v.id), ['1.20.1', '1.19.2'])
  assert.equal(list[0].forge, '47.2.0')
  assert.equal(list[0].recommended, true)
  assert.deepEqual(parseForgePromotions(null), [])
})

test('forgeArgsRelPath usa win_args/unix_args según plataforma', () => {
  assert.equal(
    forgeArgsRelPath('1.20.1', '47.2.0', 'win32'),
    'libraries/net/minecraftforge/forge/1.20.1-47.2.0/win_args.txt'
  )
  assert.equal(
    forgeArgsRelPath('1.20.1', '47.2.0', 'linux'),
    'libraries/net/minecraftforge/forge/1.20.1-47.2.0/unix_args.txt'
  )
})

test('normalizeVersions convierte strings en objetos {id} y respeta objetos', () => {
  assert.deepEqual(normalizeVersions(['1.21.8', '1.20.1']), [{ id: '1.21.8' }, { id: '1.20.1' }])
  assert.deepEqual(normalizeVersions([{ id: '1.21.8', time: 'x' }]), [{ id: '1.21.8', time: 'x' }])
  assert.deepEqual(normalizeVersions(null), [])
})