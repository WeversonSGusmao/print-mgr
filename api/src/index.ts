import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// chave simples para o coletor
app.use((req, res, next) => {
  const key = req.header('x-api-key');
  if (!key || key !== process.env.API_KEY) return res.status(401).send('unauthorized');
  next();
});

app.post('/ingest', async (req, res) => {
  const { marker_total, engine_total, engine_printer, engine_copier, engine_fax } = req.body;

  const read = await prisma.read.create({
    data: {
      markerTotal: Number(marker_total ?? 0),
      engineTotal: Number(engine_total ?? 0),
      enginePrinter: Number(engine_printer ?? 0),
      engineCopier: Number(engine_copier ?? 0),
      engineFax: Number(engine_fax ?? 0)
    }
  });

  // agrega no dia
  const day = new Date();
  day.setHours(0,0,0,0);

  // pega última leitura do mesmo dia para calcular deltas
  const lastReads = await prisma.read.findMany({
    where: { createdAt: { gte: day } },
    orderBy: { createdAt: 'asc' }
  });

  // delta simples em relação à primeira leitura do dia
  const first = lastReads[0];
  const printsDelta = read.enginePrinter - first.enginePrinter;
  const copiesDelta = read.engineCopier - first.engineCopier;
  const faxDelta    = read.engineFax - first.engineFax;
  const totalDelta  = read.engineTotal - first.engineTotal;

  await prisma.daily.upsert({
    where: { day },
    update: {
      prints: printsDelta < 0 ? 0 : printsDelta,
      copies: copiesDelta < 0 ? 0 : copiesDelta,
      fax:    faxDelta    < 0 ? 0 : faxDelta,
      total:  totalDelta  < 0 ? 0 : totalDelta
    },
    create: {
      day,
      prints: Math.max(printsDelta, 0),
      copies: Math.max(copiesDelta, 0),
      fax:    Math.max(faxDelta, 0),
      total:  Math.max(totalDelta, 0)
    }
  });

  res.json({ ok: true });
});

app.get('/daily', async (req, res) => {
  const days = await prisma.daily.findMany({ orderBy: { day: 'desc' }, take: 30 });
  res.json(days);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API listening on', port));
