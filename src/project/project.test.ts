import { Host as HostClass, type Host } from '../engine/devices/host';
import { exampleNetwork } from './example';
import { ip, ping, routedNetwork, settle } from '../engine/testing';
import { httpGet, type HttpResult } from '../engine/services/http';
import { cloneNetwork } from './clone';
import { PROJECT_FORMAT, type HostJson } from './schema';
import { ProjectError, parseProject, serializeProject, toProject } from './serialize';

function richNetwork() {
  const ctx = routedNetwork();
  const { a, b, r } = ctx;
  a.updateConfig({ dns: ip('192.168.2.10') });
  a.showIpAsName = true;
  a.install('browser');
  a.install('mailclient');
  a.mailClient.updateAccount({
    address: 'a@x.fr',
    smtpServer: 'x',
    pop3Server: 'x',
    user: 'a',
    password: 'p',
  });
  a.mailClient.inbox.push({ from: 'b@x.fr', to: ['a@x.fr'], cc: [], subject: 's', body: 'b', date: 1 });
  b.install('webserver');
  b.fs.writeFile('/webserver/index.html', '<h1>Projet</h1>');
  b.webServer.setActive(true);
  b.install('dnsserver');
  b.dnsServer.updateConfig({
    records: [{ name: 'www.x.fr', type: 'A', value: '192.168.2.10' }],
    recursion: false,
  });
  b.dnsServer.setActive(true);
  b.install('dhcpserver');
  b.dhcpServer.updateConfig({
    rangeStart: ip('192.168.2.100'),
    rangeEnd: ip('192.168.2.150'),
    reservations: [{ mac: '02:00:00:00:00:AA', ip: ip('192.168.2.200') }],
  });
  b.install('mailserver');
  b.mailServer.updateConfig({ domain: 'x.fr' });
  b.mailServer.addAccount('a', 'p');
  b.install('echoserver');
  b.echoServer.setPort(7777);
  b.firewall.enabled = true;
  b.firewall.rules = [
    {
      action: 'accept',
      protocol: 'tcp',
      source: 0,
      sourceMask: 0,
      destination: 0,
      destinationMask: 0,
      port: 80,
    },
  ];
  r.setStaticRoutes([
    { destination: ip('10.0.0.0'), mask: ip('255.0.0.0'), gateway: ip('192.168.2.254'), iface: 1 },
  ]);
  r.rip = true;
  return ctx;
}

describe('Projet', () => {
  test('aller-retour sans perte', () => {
    const { net } = richNetwork();
    const text = serializeProject(net);
    const loaded = parseProject(text);
    expect(serializeProject(loaded)).toBe(text);
    expect(toProject(loaded).format).toBe(PROJECT_FORMAT);
  });

  test('le réseau rechargé fonctionne', () => {
    const { net, a, r } = richNetwork();
    const loaded = parseProject(serializeProject(net));
    const a2 = loaded.host(a.id);
    loaded.router(r.id).rip = false; // periodic RIP traffic would keep the clock running forever
    loaded.start();
    expect(ping(loaded, a2, '192.168.2.10').kind).toBe('timeout'); // firewall: only TCP 80 allowed
    const result = settle<HttpResult>(loaded, (done) => {
      httpGet(a2, 'http://192.168.2.10/', done); // DNS (UDP 53) is blocked by the firewall
    });
    expect(result.kind === 'ok' && result.response.body).toBe('<h1>Projet</h1>');
  });

  test('les ports des câbles sont conservés', () => {
    const { net, r } = richNetwork();
    const project = toProject(net);
    // Reverse cable order: router interfaces must still map to the same networks.
    const reversed = { ...project, cables: [...project.cables].reverse() };
    const loaded = parseProject(JSON.stringify(reversed));
    const r2 = loaded.router(r.id);
    expect(r2.ports.map((p) => p.cable?.other(p).owner.id)).toEqual(
      r.ports.map((p) => p.cable?.other(p).owner.id),
    );
  });

  test('les annotations enregistrées avant l’italique se rechargent (non italiques)', () => {
    const { net } = routedNetwork();
    net.addNote({
      kind: 'text',
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      text: 'Salle',
      color: '#000000',
      fontSize: 12,
      bold: false,
      italic: true,
    });
    const project = toProject(net);
    expect(parseProject(JSON.stringify(project)).notes[0]?.italic).toBe(true);
    const old = { ...project, notes: project.notes.map(({ italic: _italic, ...rest }) => rest) };
    expect(parseProject(JSON.stringify(old)).notes[0]?.italic).toBe(false);
  });

  test('le Wi-Fi est enregistré : SSID des switchs, carte Wi-Fi et connexions sans fil', () => {
    const { net, a, s1 } = routedNetwork();
    net.setSsid(s1.id, 'Salle 12');
    net.setHostWifi(a.id, true);
    net.joinWifi(a.id, 'Salle 12');
    const project = toProject(net);
    expect(project.cables).toContainEqual(expect.objectContaining({ a: a.id, b: s1.id, wireless: true }));
    const loaded = parseProject(serializeProject(net));
    expect(toProject(loaded)).toEqual(project);
    expect(loaded.wifiAccessPoint(loaded.host(a.id))?.ssid).toBe('Salle 12');
    loaded.start();
    expect(ping(loaded, loaded.host(a.id), '192.168.2.10').kind).toBe('reply');
  });

  test('les projets enregistrés avant le Wi-Fi se rechargent (filaire, SSID par défaut)', () => {
    const { net, a } = routedNetwork();
    const project = toProject(net);
    const old = {
      ...project,
      devices: project.devices.map((d) => {
        if (d.kind === 'switch') return { ...d, ssid: undefined };
        if (d.kind === 'router') return d;
        return Object.fromEntries(Object.entries(d).filter(([key]) => key !== 'wifi'));
      }),
      cables: project.cables.map(({ wireless: _wireless, ...rest }) => rest),
    };
    const loaded = parseProject(JSON.stringify(old));
    expect(loaded.host(a.id).wifi).toBe(false);
    expect(loaded.switches.map((s) => s.ssid)).toEqual(['Wifi-1', 'Wifi-2']);
    expect(loaded.cables.every((c) => !c.wireless)).toBe(true);
  });

  test('réseau d’exemple : le portable obtient son adresse en Wi-Fi et charge le site du collège', () => {
    const net = exampleNetwork();
    const laptop = net.devices.find((d) => d.name === 'Portable');
    if (!(laptop instanceof HostClass)) throw new Error('portable attendu');
    expect(laptop.wifi).toBe(true);
    expect(laptop.wifiNetwork).toBe('Wifi-College');
    net.start();
    net.scheduler.runUntilIdle();
    expect(laptop.addressing.ip).not.toBe(ip('0.0.0.0'));
    const page = settle<HttpResult>(net, (done) => {
      httpGet(laptop, 'http://www.college.fr/', done);
    });
    expect(page.kind === 'ok' && page.response.body).toContain('Collège Pasteur');
  });

  test('un routeur dont on a ajouté puis retiré des interfaces se recharge à l’identique', () => {
    const { net, r } = routedNetwork();
    net.addRouterInterface(r.id);
    net.addRouterInterface(r.id);
    r.setInterface(3, { ip: ip('10.0.4.1'), mask: ip('255.255.255.0') });
    net.removeRouterInterface(r.id, 2);
    const project = toProject(net);
    const loaded = parseProject(serializeProject(net));
    expect(toProject(loaded)).toEqual(project);
    expect(loaded.router(r.id).interfaces.map((i) => i.ip)).toEqual([
      ip('192.168.1.1'),
      ip('192.168.2.1'),
      ip('10.0.4.1'),
    ]);
  });

  test.each([
    ['du texte', 'pas un projet', /JSON illisible/],
    [
      'un autre format',
      JSON.stringify({ format: 'autre', version: 1, devices: [], cables: [] }),
      /Projet invalide/,
    ],
    [
      'une version future',
      JSON.stringify({ format: PROJECT_FORMAT, version: 2, devices: [], cables: [] }),
      /version/,
    ],
  ])('refuse %s', (_label, text, error) => {
    expect(() => parseProject(text)).toThrow(error);
  });

  function mutate(change: (project: ReturnType<typeof toProject>) => void): string {
    const project = toProject(richNetwork().net);
    change(project);
    return JSON.stringify(project);
  }

  test('refuse les données incohérentes', () => {
    const host = (p: ReturnType<typeof toProject>) =>
      p.devices.find((d) => d.kind === 'computer') as HostJson;
    expect(() => parseProject(mutate((p) => (host(p).config.ip = '300.1.1.1')))).toThrow(/config\.ip/);
    expect(() => parseProject(mutate((p) => (host(p).config.mask = '255.0.255.0')))).toThrow(
      /Masque invalide/,
    );
    expect(() => parseProject(mutate((p) => (host(p).mac = 'zz')))).toThrow(/MAC/);
    expect(() =>
      parseProject(
        mutate((p) => {
          const first = p.devices[0];
          const second = p.devices[1];
          if (first && second) second.id = first.id;
        }),
      ),
    ).toThrow(ProjectError);
    expect(() =>
      parseProject(
        mutate((p) => {
          const h = p.devices.filter((d) => d.kind === 'computer');
          if (h[0] && h[1] && h[0].kind === 'computer' && h[1].kind === 'computer') h[1].mac = h[0].mac;
        }),
      ),
    ).toThrow(/MAC en double/);
    expect(() =>
      parseProject(
        mutate((p) => {
          const c = p.cables[0];
          if (c) c.b = 'inconnu';
        }),
      ),
    ).toThrow(/Câble/);
    expect(() =>
      parseProject(
        mutate((p) => {
          const c = p.cables[0];
          const d = p.cables[1];
          if (c && d) d.id = c.id;
        }),
      ),
    ).toThrow(/double/);
    expect(() =>
      parseProject(
        mutate((p) => {
          const r = p.devices.find((d) => d.kind === 'router');
          if (r?.kind === 'router')
            r.routes = [{ destination: '1.0.0.0', mask: '255.0.0.0', gateway: '0.0.0.0', iface: 5 }];
        }),
      ),
    ).toThrow(/interface inexistante/);
    expect(() => parseProject(mutate((p) => (host(p).fs = { 'a/b': 'x' })))).toThrow(/Nom invalide/);
    expect(() =>
      parseProject(
        mutate((p) => {
          for (const d of p.devices) if (d.kind === 'switch') d.ssid = 'Même';
        }),
      ),
    ).toThrow(/déjà utilisé/);
    expect(() =>
      parseProject(
        mutate((p) => {
          const cable = p.cables[0];
          if (cable) cable.wireless = true;
        }),
      ),
    ).toThrow(/Wi-Fi/);
    expect(() => parseProject('x'.repeat(20_000_001))).toThrow(/volumineux/);
  });

  test('enregistrer un projet qu’on vient d’ouvrir redonne le même texte', () => {
    // L'historique d'annulation compare ces textes : un aller-retour ne doit rien changer.
    const { net } = richNetwork();
    net.addNote({
      kind: 'text',
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      text: 'Salle 101',
      color: '#1c2430',
      fontSize: 16,
      bold: true,
      italic: false,
    });
    for (const network of [net, exampleNetwork()]) {
      const text = serializeProject(network);
      expect(serializeProject(parseProject(text))).toBe(text);
    }
  });

  test('un poste sans logiciel garde ses fichiers', () => {
    const { net, a } = richNetwork();
    a.fs.mkdir('/docs');
    a.setInstalled([]);
    const loaded = parseProject(serializeProject(net));
    const host: Host = loaded.host(a.id);
    expect(host.installed).toEqual([]);
    expect(host.fs.isDirectory('/docs')).toBe(true);
  });
});

describe('Copie d’un réseau', () => {
  test('même projet, mêmes identifiants, rien de partagé avec l’original', () => {
    const { net, a, b, r } = richNetwork();
    const before = serializeProject(net);
    const copy = cloneNetwork(net);
    expect(serializeProject(copy)).toBe(before);
    expect(copy.device(a.id)?.name).toBe(a.name);

    // Tout modifier dans la copie laisse l'original intact.
    const twin = copy.host(b.id);
    twin.fs.writeFile('/webserver/index.html', 'modifié');
    twin.dnsServer.updateConfig({ records: [], recursion: true });
    twin.mailServer.addAccount('z', 'z');
    copy.host(a.id).mailClient.inbox.length = 0;
    copy.host(a.id).firewall.setRules([]);
    copy.router(r.id).setStaticRoutes([]);
    copy.removeDevice(a.id);
    expect(serializeProject(net)).toBe(before);
  });

  test('la copie se simule sans toucher à l’original, même s’il est en marche', () => {
    const { net, a } = routedNetwork();
    net.start();
    net.scheduler.advance(1234);
    const captured = net.host(a.id).capture.entries.length;
    const copy = cloneNetwork(net);
    expect(copy.running).toBe(false);
    copy.start();
    expect(ping(copy, copy.host(a.id), '192.168.2.10').kind).toBe('reply');
    expect(net.scheduler.now).toBe(1234);
    expect(net.host(a.id).capture.entries).toHaveLength(captured);
    expect(net.host(a.id).stack.arp.entries).toHaveLength(0);
  });
});

describe('Terminaux variés', () => {
  test('serveur, imprimante, objet connecté, smartphone et tablette sont des postes comme les autres', () => {
    const { net, a, sw } = (() => {
      const ctx = routedNetwork();
      return { net: ctx.net, a: ctx.a, sw: ctx.s1 };
    })();
    const printer = net.addHost('printer', { config: { ip: ip('192.168.1.50'), mask: ip('255.255.255.0') } });
    const object = net.addHost('object');
    const phone = net.addHost('smartphone');
    const tablet = net.addHost('tablet');
    const server = net.addHost('server');
    expect([printer, object, phone, tablet, server].map((h) => h.name)).toEqual([
      'Imprimante 1',
      'Objet connecté 1',
      'Smartphone 1',
      'Tablette 1',
      'Serveur 1',
    ]);
    // Smartphone et tablette sont en Wi-Fi ; imprimante et objet affichent leur état sur une page web.
    expect([phone.wifi, tablet.wifi, printer.wifi, server.wifi]).toEqual([true, true, false, false]);
    expect(printer.installed).toEqual(['webserver']);
    expect(printer.webServer.active).toBe(true);
    expect(object.fs.readFile('/webserver/index.html')).toContain('Objet connecté');
    expect(phone.installed).toEqual(['browser', 'terminal']);
    expect(server.installed).toEqual(['terminal', 'texteditor', 'fileexplorer']);

    // Ajouter l'imprimante au réseau : la relier, lui donner une adresse du réseau, la joindre.
    net.connect(printer.id, sw.id);
    net.start();
    expect(ping(net, a, '192.168.1.50').kind).toBe('reply');
    const page = settle<HttpResult>(net, (done) => {
      httpGet(a, 'http://192.168.1.50/', done);
    });
    expect(page.kind === 'ok' && page.response.body).toContain('État : prête.');
  });

  test('leur sorte est enregistrée ; les réglages d’origine ne reviennent pas au rechargement', () => {
    const net = exampleNetwork();
    const printer = net.addHost('printer');
    printer.webServer.setActive(false);
    printer.fs.writeFile('/webserver/index.html', 'modifiée');
    const phone = net.addHost('smartphone');
    net.setHostWifi(phone.id, false);
    const loaded = parseProject(serializeProject(net));
    expect(loaded.host(printer.id).kind).toBe('printer');
    expect(loaded.host(printer.id).webServer.active).toBe(false);
    expect(loaded.host(printer.id).fs.readFile('/webserver/index.html')).toBe('modifiée');
    expect(loaded.host(phone.id).kind).toBe('smartphone');
    expect(loaded.host(phone.id).wifi).toBe(false);
    expect(serializeProject(loaded)).toBe(serializeProject(net));
  });
});
