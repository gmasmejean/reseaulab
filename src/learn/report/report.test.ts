import { Network } from '../../engine/network';
import { routedNetwork, staticHost } from '../../engine/testing';
import { exampleNetwork } from '../../project/example';
import { addressingTable } from './addressing';

describe('Table d’adressage', () => {
  test('une ligne par carte réseau : postes, interfaces de routeur, switchs', () => {
    const { net, a, r, s1 } = routedNetwork();
    const rows = addressingTable(net);
    expect(rows.find((row) => row.deviceId === a.id)).toEqual({
      deviceId: a.id,
      name: 'A',
      kind: 'computer',
      iface: '',
      link: s1.name,
      mode: 'fixe',
      ip: '192.168.1.10',
      mask: '255.255.255.0',
      gateway: '192.168.1.1',
      dns: '',
    });
    expect(rows.filter((row) => row.deviceId === r.id).map((row) => [row.iface, row.ip, row.link])).toEqual([
      ['eth0', '192.168.1.1', s1.name],
      ['eth1', '192.168.2.1', 'Switch 2'],
    ]);
    const sw = rows.find((row) => row.deviceId === s1.id);
    expect(sw).toMatchObject({ kind: 'switch', mode: '', ip: '', link: 'A, R' });
  });

  test('poste non relié, sans adresse, en DHCP ou en Wi-Fi', () => {
    const net = new Network();
    const lonely = staticHost(net, 'Seul', '0.0.0.0');
    lonely.updateConfig({ mask: 0 });
    net.addSwitch({ name: 'Vide' });
    const rows = addressingTable(net);
    expect(rows[0]).toMatchObject({ link: 'non relié', mode: 'fixe', ip: '', mask: '', gateway: '' });
    expect(rows[1]).toMatchObject({ name: 'Vide', link: 'non relié' });

    const example = addressingTable(exampleNetwork());
    expect(example.find((row) => row.name === 'Poste 1')).toMatchObject({
      mode: 'automatique (DHCP)',
      ip: '',
      link: 'Switch salle',
    });
    expect(example.find((row) => row.name === 'Portable')?.link).toBe(
      'Wi-Fi « Wifi-College » (Switch salle)',
    );
    expect(example.find((row) => row.name === 'Serveur web')).toMatchObject({
      ip: '192.168.2.80',
      mode: 'fixe',
    });
  });
});
