import snmp from 'net-snmp';
import axios from 'axios';
import 'dotenv/config';

const {
  PRINTER_IP, SNMP_VERSION, SNMP_COMMUNITY,
  SNMP_USER, SNMP_AUTH, SNMP_PRIV,
  API_BASE, API_KEY
} = process.env;

// OIDs (Printer-MIB + Ricoh Private MIB)
const OIDS = {
  marker_total: '1.3.6.1.2.1.43.10.2.1.4.1.1',           // prtMarkerLifeCount  (RFC 3805)  [2](https://www.rfc-editor.org/rfc/rfc3805)
  engine_total: '1.3.6.1.4.1.367.3.2.1.2.19.1.0',        // ricohEngCounterTotal          [4](https://mibs.observium.org/mib/RicohPrivateMIB/)
  engine_printer: '1.3.6.1.4.1.367.3.2.1.2.19.2.0',      // ricohEngCounterPrinter        [4](https://mibs.observium.org/mib/RicohPrivateMIB/)
  engine_copier: '1.3.6.1.4.1.367.3.2.1.2.19.4.0',       // ricohEngCounterCopier         [4](https://mibs.observium.org/mib/RicohPrivateMIB/)
  engine_fax: '1.3.6.1.4.1.367.3.2.1.2.19.3.0'           // ricohEngCounterFax            [4](https://mibs.observium.org/mib/RicohPrivateMIB/)
};

function createSession() {
  if (SNMP_VERSION === 'v3') {
    const options = {
      version: snmp.Version3,
      idBitsSize: 32,
      context: '',
      port: 161,
      transport: 'udp4',
      security: {
        level: snmp.SecurityLevel.authPriv,
        userName: SNMP_USER,
        authProtocol: snmp.AuthProtocols.sha,     // ajuste conforme config
        authKey: SNMP_AUTH,
        privProtocol: snmp.PrivProtocols.aes,     // ajuste conforme config
        privKey: SNMP_PRIV
      }
    };
    return snmp.createSession(PRINTER_IP, options);
  }
  // v2c
  return snmp.createSession(PRINTER_IP, SNMP_COMMUNITY, { version: snmp.Version2c });
}

async function pollOnce() {
  const session = createSession();
  const oids = Object.values(OIDS);

  const pdu = await new Promise((resolve, reject) => {
    session.get(oids, (err, varbinds) => {
      session.close();
      if (err) return reject(err);
      const data = {};
      varbinds.forEach((vb, i) => {
        if (snmp.isVarbindError(vb)) return;
        const key = Object.keys(OIDS)[i];
        data[key] = Number(vb.value);
      });
      resolve(data);
    });
  });

  // envia para API
  await axios.post(`${API_BASE}/ingest`, pdu, {
    headers: { 'x-api-key': API_KEY }
  });

  console.log('Coleta enviada:', pdu, new Date().toISOString());
}

async function main() {
  await pollOnce();                  // uma execução
  // agendar a cada 5 minutos:
  setInterval(pollOnce, 5 * 60 * 1000);
}

main().catch(err => {
  console.error('Falha no coletor', err);
  process.exit(1);
});
