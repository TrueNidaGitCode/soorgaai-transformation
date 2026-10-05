/**
 * Connectors: mounted by server.js at /api/connectors.
 *
 * Every route is the owner's. The public chat session is refused before any
 * handler runs, so nothing here can be reached from the chat.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { list, create, update, test, sync, remove } from '../controllers/connectorController.js';
import { zohoStatus, zohoStart, zohoModules, zohoScan, zohoConnectOne, zohoFinish } from '../controllers/zohoConnectController.js';
import { leadsquaredScan, leadsquaredConnectOne } from '../controllers/leadsquaredConnectController.js';
import { jiraScan, jiraConnectOne } from '../controllers/jiraConnectController.js';
import { cliniceaScan, cliniceaConnectOne } from '../controllers/cliniceaConnectController.js';

const router = express.Router();

router.use(protect, requireOwner);

router.get('/', list);
router.post('/', express.json(), create);

/*
 * Zoho in one click. Declared before /:id, or "zoho" becomes a connector id
 * nobody can explain — the same ordering trap the findings routes carry a
 * comment about.
 */
router.get ('/zoho/status', zohoStatus);
router.post('/zoho/start',   express.json(), zohoStart);
router.post('/zoho/modules', express.json(), zohoModules);
// Finding is one request; connecting is one request per module, so the page
// can count them as they land rather than animate a guess.
router.post('/zoho/scan',    express.json(), zohoScan);
router.post('/zoho/connect', express.json(), zohoConnectOne);
router.post('/zoho/finish', express.json(), zohoFinish);
// LeadSquared, in the same two steps as Zoho: find what holds records, then connect each.
router.post('/leadsquared/scan',    express.json(), leadsquaredScan);
router.post('/leadsquared/connect', express.json(), leadsquaredConnectOne);
// Jira, in the same two steps: find the projects holding issues, then connect each.
router.post('/jira/scan',    express.json(), jiraScan);
router.post('/jira/connect', express.json(), jiraConnectOne);
// Clinicea, in the same two steps: find the parts holding records, then connect each.
router.post('/clinicea/scan',    express.json(), cliniceaScan);
router.post('/clinicea/connect', express.json(), cliniceaConnectOne);
router.patch('/:id', express.json(), update);
router.post('/:id/test', test);
router.post('/:id/sync', sync);
router.delete('/:id', remove);

export default router;
