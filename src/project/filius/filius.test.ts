import { formatIp } from '../../engine/core/ipv4';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { Device } from '../../engine/devices/device';
import type { Network } from '../../engine/network';
import { httpGet, type HttpResult } from '../../engine/services/http';
import { ip, pingFor } from '../../engine/testing';
import { makeZip } from '../../test/zip';
import { ProjectError, parseProject, serializeProject } from '../serialize';
import { convertFilius } from './convert';
import { JField, JObject, decodeXmlEncoder } from './decoder';
import fixture from './fixtures/konfiguration.xml?raw';
import { FILIUS_CONFIG_ENTRY, importFilius, isZip } from './index';
import { elementsOf, parseXml, textOf } from './xml';
import { MAX_ENTRY_SIZE, ZipError, listZip, readZipEntry } from './zip';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function decodeXml(body: string) {
  return decodeXmlEncoder(parseXml(`<java>${body}</java>`));
}

describe('XML', () => {
  test('éléments, attributs, entités, CDATA et commentaires', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><a x="1" y='&lt;2&gt;'> t&amp;u &#233;&#xE9; <b/><![CDATA[<brut>]]><!-- d --><c>z</c></a>`,
    );
    expect(root.name).toBe('a');
    expect(root.attributes).toEqual({ x: '1', y: '<2>' });
    expect(elementsOf(root).map((e) => e.name)).toEqual(['b', 'c']);
    expect(textOf(root)).toBe(' t&u éé <brut>');
  });

  test.each([
    ['<a><b></a>', /ne ferme pas/],
    ['<a>', /non fermé/],
    ['<a>&nope;</a>', /Entité inconnue/],
    ['<a x="1" x="2"/>', /en double/],
    ['<a/><b/>', /après l’élément racine/],
    ['<!DOCTYPE a><a/>', /DOCTYPE/],
    ['<a x=1/>', /guillemet/],
  ])('refuse %s', (text, message) => {
    expect(() => parseXml(text)).toThrow(message);
  });
});

describe('ZIP', () => {
  test.each([false, true])('lit les entrées (compressées : %s)', async (deflate) => {
    const zip = await makeZip({ 'a.txt': 'bonjour', 'dossier/b.txt': 'é'.repeat(1000) }, { deflate });
    expect(isZip(zip)).toBe(true);
    const entries = listZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dossier/b.txt']);
    const [a, b] = entries;
    if (!a || !b) throw new Error('entrées manquantes');
    expect(decode(await readZipEntry(zip, a))).toBe('bonjour');
    expect(decode(await readZipEntry(zip, b))).toBe('é'.repeat(1000));
  });

  test('refuse les fichiers qui ne sont pas des archives valides', async () => {
    expect(isZip(encode('{"format":"reseaulab"}'))).toBe(false);
    expect(() => listZip(encode('pas une archive'))).toThrow(ZipError);
    const zip = await makeZip({ 'a.txt': 'x' });
    const entry = listZip(zip)[0];
    if (!entry) throw new Error('entrée manquante');
    await expect(readZipEntry(zip, { ...entry, method: 12 })).rejects.toThrow(/compression/);
    await expect(readZipEntry(zip, { ...entry, localHeaderOffset: 5 })).rejects.toThrow(/corrompue/);
    await expect(readZipEntry(zip, { ...entry, compressedSize: 1e6 })).rejects.toThrow(/tronquée/);
    await expect(readZipEntry(zip, { ...entry, size: MAX_ENTRY_SIZE + 1 })).rejects.toThrow(/volumineux/);
    await expect(readZipEntry(zip, { ...entry, method: 8 })).rejects.toThrow(/corrompues/);
    const encrypted = zip.slice();
    encrypted[6] = 1;
    await expect(readZipEntry(encrypted, entry)).rejects.toThrow(/chiffrée/);
  });
});

describe('Décodage XMLEncoder', () => {
  test('valeurs simples, objets, propriétés, références et champs publics', () => {
    const [text, n, flag, nothing, obj] = decodeXml(`
      <string>a<char code="#10"/>b</string><int>42</int><boolean>true</boolean><null/>
      <object class="x.Point" id="P">
        <void class="x.Point" method="getField"><string>x</string>
          <void method="set"><object idref="P"/><int>7</int></void>
        </void>
        <void property="label"><string>ici</string></void>
        <void property="inner"><void property="deep"><double>1.5</double></void></void>
        <void id="B" method="isEnabled"/>
        <void property="flag"><object idref="B"/></void>
        <void property="items">
          <void index="1"><string>second</string></void>
          <void method="add"><string>troisième</string></void>
          <void method="add"><int>0</int><string>premier</string></void>
        </void>
        <void property="map">
          <void method="put"><string>k</string><string>v</string></void>
          <void method="get"><string>autre</string><void property="z"><int>1</int></void></void>
        </void>
        <void method="addMouseListener"><object class="javax.swing.ToolTipManager" method="sharedInstance"/></void>
      </object>`);
    expect(text).toBe('a\nb');
    expect([n, flag, nothing]).toEqual([42, true, null]);
    if (!(obj instanceof JObject)) throw new Error('objet attendu');
    expect(obj.className).toBe('x.Point');
    expect(obj.number('x')).toBe(7);
    expect(obj.string('label')).toBe('ici');
    expect(obj.child('inner').number('deep')).toBe(1.5);
    expect(obj.boolean('flag')).toBe(true);
    expect(obj.child('items').items).toEqual(['premier', undefined, 'second', 'troisième']);
    expect(obj.child('map').entries.get('k')).toBe('v');
    expect(obj.child('map').entry('autre').number('z')).toBe(1);
  });

  test('tableaux et <void idref> qui rouvre un objet connu', () => {
    const [list, ref] = decodeXml(`
      <object class="java.util.LinkedList" id="L">
        <void method="add"><array class="java.lang.String" length="2">
          <void index="0"><string>a</string></void>
        </array></void>
      </object>
      <object class="Holder">
        <void property="p">
          <void idref="L"><void id="X" property="extra"/></void>
          <object idref="X"/>
        </void>
      </object>`);
    if (!(list instanceof JObject) || !(ref instanceof JObject)) throw new Error('objets attendus');
    const array = list.items[0];
    expect(array instanceof JObject && array.items).toEqual(['a', undefined]);
    expect(ref.props.get('p')).toBe(list.child('extra'));
  });

  test('refuse les documents invalides', () => {
    expect(() => decodeXmlEncoder(parseXml('<root/>'))).toThrow(/java/);
    expect(() => decodeXml('<object idref="inconnu"/>')).toThrow(/Référence inconnue/);
    expect(() => decodeXml('<int>abc</int>')).toThrow(/Nombre invalide/);
    expect(() => decodeXml('<script/>')).toThrow(/inattendu/);
    expect(() => decodeXml('<object class="A"><void index="-1"/></object>')).toThrow(/Indice/);
    expect(() => decodeXml('<string><char code="x"/></string>')).toThrow(/Caractère/);
    expect(() => decodeXmlEncoder(parseXml(`<java>${'<int>1</int>'.repeat(20)}</java>`), 10)).toThrow(
      /volumineux/,
    );
    const deep = '<object class="A"><void property="p">'.repeat(210) + '</void></object>'.repeat(210);
    expect(() => decodeXml(deep)).toThrow(/imbriqué/);
  });

  test('Field.set ignore les cibles invalides', () => {
    const field = new JField('x');
    expect(field.name).toBe('x');
    expect(decodeXml('<object class="A"><void class="A" method="other"/></object>')).toHaveLength(1);
  });
});

async function importFixture(xml = fixture) {
  return importFilius(
    await makeZip(
      { [FILIUS_CONFIG_ENTRY]: xml, 'projekt/anwendungen/EigeneAnwendungen.txt': '' },
      { deflate: true },
    ),
  );
}

function byName<T extends Device>(
  network: Network,
  name: string,
  type: abstract new (...args: never[]) => T,
): T {
  const device = network.devices.find((d) => d.name === name);
  if (!(device instanceof type)) throw new Error(`${name} introuvable`);
  return device;
}

describe('Import d’un projet Filius', () => {
  test('reprend les équipements, leur configuration et le câblage', async () => {
    const { network, warnings, version } = await importFixture();
    expect(version).toBe('2.5.1');
    expect(network.devices.map((d) => d.kind)).toEqual([
      'computer',
      'laptop',
      'computer',
      'switch',
      'router',
      'computer',
    ]);

    // Valeurs par défaut de Filius pour ce qui n'est pas écrit dans le fichier.
    const pc = byName(network, '192.168.0.10', Host);
    expect(formatIp(pc.config.ip)).toBe('192.168.0.10');
    expect(formatIp(pc.config.mask)).toBe('255.255.255.0');
    expect(formatIp(pc.config.gateway)).toBe('192.168.0.1');
    expect(pc.mac).toBe('A1:B2:C3:D4:E5:01');
    expect(pc.showIpAsName).toBe(true);
    expect(pc.position).toEqual({ x: 140, y: 232 });
    expect([...pc.installed].sort()).toEqual(['browser', 'terminal']);
    expect(pc.fs.readFile('/images/logo.png')).toBe('data:image/png;base64,iVBORw0KGgo=');

    const laptop = byName(network, 'Portable élève', Host);
    expect(laptop.config.useDhcp).toBe(true);

    const dhcp = byName(network, 'Serveur DHCP', Host);
    expect(dhcp.dhcpServer.active).toBe(true);
    expect(dhcp.isInstalled('dhcpserver')).toBe(true);
    expect(formatIp(dhcp.dhcpServer.config.rangeStart)).toBe('192.168.0.100');
    expect(formatIp(dhcp.dhcpServer.config.rangeEnd)).toBe('192.168.0.150');
    expect(formatIp(dhcp.dhcpServer.config.dns)).toBe('10.0.0.53');
    expect(dhcp.dhcpServer.config.reservations).toEqual([
      { mac: 'A1:B2:C3:D4:E5:09', ip: ip('192.168.0.99') },
    ]);

    const router = byName(network, 'Routeur', Router);
    expect(router.interfaces.map((i) => `${formatIp(i.ip)}/${formatIp(i.mask)}`)).toEqual([
      '192.168.0.1/255.255.255.0',
      '10.0.0.1/255.255.0.0',
      '172.16.0.1/255.255.255.0',
    ]);
    expect(router.rip).toBe(true);
    expect(router.staticRoutes).toEqual([
      expect.objectContaining({
        destination: ip('172.20.5.0'),
        mask: ip('255.255.255.0'),
        gateway: ip('172.16.0.254'),
        iface: 2,
      }),
    ]);
    expect(router.firewall.enabled).toBe(true);
    expect(
      router.firewall.rules.map((r) => `${r.action} ${r.protocol} ${formatIp(r.source)} ${String(r.port)}`),
    ).toEqual([
      'accept icmp 0.0.0.0 0',
      'accept tcp 192.168.0.0 80',
      'accept tcp 10.0.0.0 80',
      'accept tcp 172.16.0.0 80',
    ]);

    const server = byName(network, 'Serveur', Host);
    expect(server.dnsServer.active).toBe(true);
    expect(server.dnsServer.config.recursion).toBe(true);
    expect(server.dnsServer.config.records).toEqual([
      { name: 'www.lycee.fr', type: 'A', value: '10.0.0.53' },
      { name: 'lycee.fr', type: 'MX', value: 'mail.lycee.fr' },
    ]);
    expect(server.webServer.active).toBe(true);
    expect(server.fs.readFile('/webserver/index.html')).toBe('<html><body><h1>Lycée</h1></body></html>');

    const sw = byName(network, 'Switch salle', Switch);
    expect(network.cables).toHaveLength(5);
    expect(network.cables.filter((c) => c.a === sw.id || c.b === sw.id)).toHaveLength(4);

    expect(network.notes).toEqual([
      expect.objectContaining({ kind: 'zone', x: 50, y: 150, width: 400, height: 250, color: '#bfffdb' }),
      expect.objectContaining({
        kind: 'text',
        text: 'Salle 101',
        fontSize: 18,
        bold: true,
        italic: true,
        color: '#1c2430',
      }),
    ]);

    expect(warnings).toEqual([
      'Logiciel non pris en charge ignoré : Échange de fichiers (pair à pair).',
      'Serveur : enregistrement DNS de type TXT ignoré.',
      'Les modems ne sont pas pris en charge : ils ont été ignorés, avec leurs câbles.',
      'Un câble relié à un équipement non importé a été ignoré.',
    ]);
  });

  test('le réseau importé fonctionne : DHCP, routage, pare-feu, web', async () => {
    const { network } = await importFixture();
    const pc = byName(network, '192.168.0.10', Host);
    const laptop = byName(network, 'Portable élève', Host);
    network.start();
    network.scheduler.advance(5000);
    expect(formatIp(laptop.addressing.ip)).toMatch(/^192\.168\.0\.1[0-5]\d$/);
    expect(formatIp(laptop.addressing.dns)).toBe('10.0.0.53');
    // ICMP traverse le pare-feu du routeur (comme dans Filius)…
    expect(pingFor(network, laptop, '10.0.0.53')?.kind).toBe('reply');
    // …ainsi que le web, autorisé par la règle « même réseau, TCP 80 ».
    let page: HttpResult | null = null;
    httpGet(pc, 'http://10.0.0.53/', (r) => {
      page = r;
    });
    network.scheduler.advance(10_000);
    expect(page).toMatchObject({ kind: 'ok', response: { status: 200 } });
    // Le DNS (UDP) est bloqué par la politique par défaut du pare-feu.
    let dns: { kind: string } | null = null;
    pc.dns.resolve('www.lycee.fr', (r) => {
      dns = r;
    });
    network.scheduler.advance(20_000);
    expect(dns).not.toMatchObject({ kind: 'ok' });
  });

  test('le projet importé s’enregistre au format RéseauLab, annotations comprises', async () => {
    const { network } = await importFixture();
    const reloaded = parseProject(serializeProject(network));
    expect(reloaded.devices.map((d) => d.name)).toEqual(network.devices.map((d) => d.name));
    expect(reloaded.notes).toEqual(network.notes);
    expect(reloaded.cables).toEqual(network.cables);
  });

  test('applique les valeurs par défaut et corrige les données invalides', () => {
    const values = decodeXml(`
      <object class="java.util.LinkedList">
        <void method="add"><object class="filius.gui.netzwerksicht.GUIKnotenItem">
          <void property="knoten"><object class="filius.hardware.knoten.Rechner">
            <void property="netzwerkInterfaces">
              <void index="0">
                <void property="ip"><string>300.1.1.1</string></void>
                <void property="subnetzMaske"><string>255.0.255.0</string></void>
                <void property="mac"><string>pas une mac</string></void>
              </void>
              <void method="add"><object class="filius.hardware.NetzwerkInterface"/></void>
            </void>
            <void property="systemSoftware">
              <void property="dateisystem"><void property="arbeitsVerzeichnis">
                <void method="add"><object class="javax.swing.tree.DefaultMutableTreeNode">
                  <void property="userObject"><object class="filius.software.system.Datei">
                    <void property="name"><string>a/b.txt</string></void>
                    <void property="dateiInhalt"><string>x</string></void>
                  </object></void>
                </object></void>
                <void method="add"><object class="javax.swing.tree.DefaultMutableTreeNode">
                  <void property="userObject"><string>..</string></void>
                </object></void>
              </void></void>
              <void property="installierteAnwendungen">
                <void method="put"><string>filius.software.Inconnu</string><object class="filius.software.Inconnu"/></void>
                <void method="put"><string>filius.software.firewall.Firewall</string>
                  <object class="filius.software.firewall.Firewall">
                    <void property="dropICMP"><boolean>true</boolean></void>
                    <void property="filterUdp"><boolean>false</boolean></void>
                    <void property="defaultPolicy"><short>1</short></void>
                    <void property="ruleset"><void method="add">
                      <object class="filius.software.firewall.FirewallRule" id="R">
                        <void class="filius.software.firewall.FirewallRule" method="getField"><string>srcIP</string>
                          <void method="set"><object idref="R"/><string>pas une ip</string></void></void>
                      </object>
                    </void></void>
                  </object>
                </void>
                <void method="put"><string>filius.software.email.EmailServer</string>
                  <object class="filius.software.email.EmailServer"><void property="aktiv"><boolean>true</boolean></void></object>
                </void>
                <void method="put"><string>filius.software.email.EmailAnwendung</string><object class="filius.software.email.EmailAnwendung"/></void>
                <void method="put"><string>filius.software.clientserver.ServerBaustein</string>
                  <object class="filius.software.clientserver.ServerBaustein"><void property="port"><int>99999</int></void></object>
                </void>
              </void>
            </void>
          </object></void>
        </object></void>
        <void method="add"><object class="filius.gui.netzwerksicht.GUIKnotenItem">
          <void property="knoten"><object class="filius.hardware.knoten.Vermittlungsrechner">
            <void property="netzwerkInterfaces">
              <void index="0"><void property="ip"><string>10.0.0.1</string></void></void>
            </void>
            <void property="systemSoftware"><void property="weiterleitungstabelle"><void property="manuelleTabelle">
              <void method="add"><array class="java.lang.String" length="4">
                <void index="0"><string>10.9.0.0</string></void>
                <void index="1"><string>255.255.0.0</string></void>
                <void index="3"><string>1.2.3.4</string></void>
              </array></void>
            </void></void></void>
          </object></void>
        </object></void>
        <void method="add"><object class="filius.gui.netzwerksicht.GUIKnotenItem">
          <void property="knoten"><object class="filius.hardware.knoten.Inconnu"/></void>
        </object></void>
      </object>
      <object class="java.util.ArrayList">
        <void method="add"><object class="filius.gui.netzwerksicht.GUIDocuItem"/></void>
      </object>`);
    const { project, warnings } = convertFilius(values);
    const [host, router] = project.devices;
    if (host?.kind !== 'computer' || router?.kind !== 'router') throw new Error('équipements attendus');
    expect(host.name).toBe('Ordinateur 1');
    expect(host.config).toMatchObject({ ip: '192.168.0.10', mask: '255.255.255.0' });
    expect(host.mac).toMatch(/^02:/);
    expect(host.fs).toEqual({ 'a_b.txt': 'x' });
    expect(host.installed.sort()).toEqual(['echoserver', 'firewall', 'mailclient', 'mailserver']);
    expect(host.echoServer.port).toBe(55555);
    expect(host.mailServer).toMatchObject({ active: true, domain: 'filius.de', accounts: [] });
    expect(host.firewall).toEqual({
      enabled: true,
      rules: [
        expect.objectContaining({ action: 'drop', protocol: 'icmp' }),
        expect.objectContaining({ action: 'accept', protocol: 'udp' }),
        expect.objectContaining({ action: 'accept', protocol: 'any' }),
      ],
    });
    expect(router.name).toBe('Routeur 2');
    expect(router.interfaces).toHaveLength(2);
    expect(router.routes).toEqual([]);
    expect(project.notes).toEqual([expect.objectContaining({ kind: 'zone', width: 200, height: 120 })]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('300.1.1.1'),
        expect.stringContaining('255.0.255.0'),
        expect.stringContaining('première carte réseau'),
        expect.stringContaining('renommé'),
        expect.stringContaining('« .. » ignoré'),
        expect.stringContaining('Inconnu'),
        expect.stringContaining('règle de pare-feu'),
        expect.stringContaining('comptes de messagerie'),
        expect.stringContaining('route'),
        'Équipement inconnu ignoré : Inconnu.',
      ]),
    );
  });

  test('refuse les fichiers qui ne sont pas des projets Filius', async () => {
    await expect(importFilius(encode('texte'))).rejects.toThrow(ProjectError);
    await expect(importFilius(await makeZip({ 'autre.txt': 'x' }))).rejects.toThrow(/absent/);
    await expect(
      importFilius(await makeZip({ [FILIUS_CONFIG_ENTRY]: '<java><int>1</int></java>' })),
    ).rejects.toThrow(/Aucun équipement/);
    await expect(importFilius(await makeZip({ [FILIUS_CONFIG_ENTRY]: '<java>' }))).rejects.toThrow(
      /XML invalide/,
    );
    await expect(
      importFilius(await makeZip({ [FILIUS_CONFIG_ENTRY]: new Uint8Array([0xff, 0xfe]) })),
    ).rejects.toThrow(ProjectError);
    await expect(importFilius(new Uint8Array(30_000_001))).rejects.toThrow(/volumineux/);
  });
});
