import type { Host } from '../engine/devices/host';
import { ip, ping, routedNetwork, settle } from '../engine/testing';
import { httpGet, type HttpResult } from '../engine/services/http';
import { PROJECT_FORMAT } from './schema';
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
      p.devices.find((d) => d.kind === 'computer') as Extract<
        ReturnType<typeof toProject>['devices'][number],
        { kind: 'computer' | 'laptop' }
      >;
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
    expect(() => parseProject('x'.repeat(20_000_001))).toThrow(/volumineux/);
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
