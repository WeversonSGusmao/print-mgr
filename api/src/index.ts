import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Rotas PÚBLICAS
app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/daily', async (_req: Request, res: Response) => {
  const days = await prisma.daily.findMany({ orderBy: { day: 'desc' }, take: 30 });
  res.json(days);
});

// (Opcional) página raiz pública
app.get('/', (_req, res) => res.send('OK'));

// Middleware de API-KEY (aplicar SOMENTE nas rotas que precisam)
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-api-key');
  if (!key || key !== process.env.API_KEY) return res.status(401).send('unauthorized');
  next();
}

// Rota PROTEGIDA (aplica o middleware aqui)
app.post('/ingest', requireApiKey, async (req: Request, res: Response) => {
  const { marker_total, engine_total, engine_printer, engine_copier, engine_fax } = req.body;

  const read = await prisma.read.create({
    data: {
      markerTotal: Number(marker_total ?? 0),
      engineTotal: Number(engine_total ?? 0),
      enginePrinter: Number(engine_printer ?? 0),
      engineCopier: Number(engine_copier ?? 0),
      engineFax: Number(engine_fax ?? 0),
    }
  });

  const day = new Date(); day.setHours(0,0,0,0);

  const firstToday = await prisma.read.findFirst({
    where: { createdAt: { gte: day } },
    orderBy: { createdAt: 'asc' }
  });

  let printsDelta = 0, copiesDelta = 0, faxDelta = 0, totalDelta = 0;
  if (firstToday) {
    printsDelta = read.enginePrinter - firstToday.enginePrinter;
    copiesDelta = read.engineCopier  - firstToday.engineCopier;
    faxDelta    = read.engineFax     - firstToday.engineFax;
    totalDelta  = read.engineTotal   - firstToday.engineTotal;
  }

  await prisma.daily.upsert({
    where: { day },
    update: {
      prints: Math.max(printsDelta, 0),
      copies: Math.max(copiesDelta, 0),
      fax:    Math.max(faxDelta, 0),
      total:  Math.max(totalDelta, 0)
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API listening on', port));
