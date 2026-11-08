import { parseIp, prefixToMask, type Ipv4 } from '../engine/core/ipv4';
import { Network } from '../engine/network';

function ip(text: string): Ipv4 {
  const value = parseIp(text);
  if (value === null) throw new Error(text);
  return value;
}

const MASK = prefixToMask(24);

const HOME_PAGE = `<html>
<head><title>Collège Pasteur</title></head>
<body>
<h1>Bienvenue sur le site du collège</h1>
<p>Cette page est hébergée par le <b>serveur web</b> du réseau 192.168.2.0/24.</p>
<p>Votre navigateur l'a obtenue grâce au <b>DNS</b> (nom → adresse IP),
puis au protocole <b>HTTP</b> transporté par <b>TCP</b>.</p>
<ul>
<li><a href="menu.html">Menu de la cantine</a></li>
</ul>
</body>
</html>
`;

const MENU_PAGE = `<html>
<head><title>Menu</title></head>
<body>
<h2>Menu de la semaine</h2>
<table border="1">
<tr><th>Jour</th><th>Plat</th></tr>
<tr><td>Lundi</td><td>Lasagnes</td></tr>
<tr><td>Mardi</td><td>Poisson et riz</td></tr>
</table>
<p><a href="index.html">Retour à l'accueil</a></p>
</body>
</html>
`;

/**
 * Ready-made classroom network: a pupils' LAN using DHCP, a router, and a
 * server LAN with DNS, web and mail servers.
 */
export function exampleNetwork(): Network {
  const net = new Network();
  const sw1 = net.addSwitch({ name: 'Switch salle', position: { x: 360, y: 300 } });
  const router = net.addRouter({ name: 'Routeur', position: { x: 620, y: 300 } });
  const sw2 = net.addSwitch({ name: 'Switch serveurs', position: { x: 880, y: 300 } });
  router.setInterface(0, { ip: ip('192.168.1.1'), mask: MASK });
  router.setInterface(1, { ip: ip('192.168.2.1'), mask: MASK });

  const pupils = [
    { name: 'Poste 1', x: 140, y: 140, kind: 'computer' as const },
    { name: 'Poste 2', x: 140, y: 300, kind: 'computer' as const },
    { name: 'Portable', x: 140, y: 460, kind: 'laptop' as const },
  ].map((p) => {
    const host = net.addHost(p.kind, {
      name: p.name,
      position: { x: p.x, y: p.y },
      config: { useDhcp: true },
    });
    host.install('browser');
    host.install('mailclient');
    net.connect(host.id, sw1.id);
    return host;
  });

  const dhcp = net.addHost('computer', {
    name: 'Serveur DHCP',
    position: { x: 360, y: 500 },
    config: { ip: ip('192.168.1.2'), mask: MASK, gateway: ip('192.168.1.1'), dns: ip('192.168.2.53') },
  });
  dhcp.install('dhcpserver');
  dhcp.dhcpServer.updateConfig({
    rangeStart: ip('192.168.1.100'),
    rangeEnd: ip('192.168.1.150'),
    gateway: ip('192.168.1.1'),
    dns: ip('192.168.2.53'),
  });
  dhcp.dhcpServer.setActive(true);
  net.connect(dhcp.id, sw1.id);
  net.connect(sw1.id, router.id);
  net.connect(router.id, sw2.id);

  const serverConfig = (address: string) => ({
    ip: ip(address),
    mask: MASK,
    gateway: ip('192.168.2.1'),
    dns: ip('192.168.2.53'),
  });
  const dns = net.addHost('computer', {
    name: 'Serveur DNS',
    position: { x: 1100, y: 140 },
    config: serverConfig('192.168.2.53'),
  });
  dns.install('dnsserver');
  dns.dnsServer.updateConfig({
    records: [
      { name: 'www.college.fr', type: 'A', value: '192.168.2.80' },
      { name: 'mail.college.fr', type: 'A', value: '192.168.2.25' },
      { name: 'college.fr', type: 'MX', value: 'mail.college.fr' },
    ],
  });
  dns.dnsServer.setActive(true);

  const web = net.addHost('computer', {
    name: 'Serveur web',
    position: { x: 1100, y: 300 },
    config: serverConfig('192.168.2.80'),
  });
  web.install('webserver');
  web.fs.writeFile('/webserver/index.html', HOME_PAGE);
  web.fs.writeFile('/webserver/menu.html', MENU_PAGE);
  web.webServer.setActive(true);

  const mail = net.addHost('computer', {
    name: 'Serveur mail',
    position: { x: 1100, y: 460 },
    config: serverConfig('192.168.2.25'),
  });
  mail.install('mailserver');
  mail.mailServer.updateConfig({ domain: 'college.fr' });
  mail.mailServer.addAccount('eleve1', 'eleve1');
  mail.mailServer.addAccount('eleve2', 'eleve2');
  mail.mailServer.setActive(true);

  pupils.forEach((host, i) => {
    const user = `eleve${Math.min(i + 1, 2)}`;
    host.mailClient.updateAccount({
      address: `${user}@college.fr`,
      smtpServer: 'mail.college.fr',
      pop3Server: 'mail.college.fr',
      user,
      password: user,
    });
  });

  for (const server of [dns, web, mail]) net.connect(server.id, sw2.id);
  return net;
}
