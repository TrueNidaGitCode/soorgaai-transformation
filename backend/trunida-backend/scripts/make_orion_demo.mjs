/**
 * Project Orion — the engineering reverse demo, as files the product reads.
 *
 *   node scripts/make_orion_demo.mjs [outDir]
 *
 * Writes three spreadsheets a delivery head would recognise — the project
 * plan, the timesheet summary and the validation log — with every date
 * counted from today, so the demo shows the same thing whichever day it is
 * run. Upload the folder on the Data page of an application built for an
 * Engineering & Project Operations blueprint (see docs/demo-engineering.md).
 *
 * Orion is invented, and the demo should say so. What it is not is staged:
 * the findings it produces come from the real watchers running the real plan
 * operators on these rows, and __tests__/orionDemo.test.js runs exactly that.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const day = (offset, now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const csv = (rows) => rows.map((r) => r.map((c) => {
  const s = String(c ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n') + '\n';

/**
 * The plan. Firmware integration is the story: 71% done against 86% planned,
 * its due date ten days out, 164 hours booked against an estimate of 120.
 * The rest are there so the finding is one task among a real-looking plan,
 * not the only row.
 */
export function orionFiles(now = new Date()) {
  const plan = [
    ['task_id', 'task_name', 'owner', 'status', 'start_date', 'due_date', 'planned_percent', 'percent_complete', 'estimated_hours', 'actual_hours'],
    ['ORN-101', 'Requirements baseline', 'Meera Pillai', 'Done', day(-70, now), day(-42, now), '100', '100', '80', '76'],
    ['ORN-102', 'Hardware schematic release', 'Arjun Nair', 'Done', day(-60, now), day(-30, now), '100', '100', '140', '150'],
    ['ORN-103', 'Firmware integration', 'Asha Rao', 'In progress', day(-40, now), day(10, now), '86', '71', '120', '164'],
    ['ORN-104', 'HIL bench bring-up', 'Kiran Shetty', 'Blocked', day(-30, now), day(35, now), '55', '30', '80', '82'],
    ['ORN-105', 'Validation suite execution', 'Ravi Kumar', 'In progress', day(-20, now), day(23, now), '45', '40', '200', '150'],
    ['ORN-106', 'Customer FAT readiness', '', 'Not started', day(5, now), day(30, now), '0', '0', '60', '0'],
    ['ORN-107', 'Bootloader security review', 'Divya Menon', 'In progress', day(-25, now), day(40, now), '50', '48', '90', '70'],
  ];

  const validation = [
    ['item_id', 'summary', 'linked_task', 'severity', 'status', 'owner', 'raised_on', 'due_date'],
    ['VAL-21', 'CAN timeout under bus load', 'Firmware integration', 'High', 'Open', 'Asha Rao', day(-12, now), day(8, now)],
    ['VAL-22', 'Watchdog reset on cold start', 'Firmware integration', 'High', 'Open', 'Asha Rao', day(-9, now), day(8, now)],
    ['VAL-23', 'HIL harness pin-out mismatch', 'HIL bench bring-up', 'Medium', 'Blocked', 'Kiran Shetty', day(-15, now), day(20, now)],
    ['VAL-24', 'Diagnostic DTC mapping incomplete', 'Validation suite execution', 'Medium', 'Open', '', day(-6, now), day(18, now)],
    ['VAL-25', 'Flash write endurance test', 'Validation suite execution', 'Low', 'Closed', 'Ravi Kumar', day(-30, now), day(-5, now)],
  ];

  const timesheet = [
    ['week_ending', 'engineer', 'task_name', 'hours'],
    [day(-14, now), 'Asha Rao', 'Firmware integration', '44'],
    [day(-7, now), 'Asha Rao', 'Firmware integration', '46'],
    [day(0, now), 'Asha Rao', 'Firmware integration', '45'],
    [day(-7, now), 'Kiran Shetty', 'HIL bench bring-up', '12'],
    [day(0, now), 'Kiran Shetty', 'HIL bench bring-up', '6'],
    [day(0, now), 'Ravi Kumar', 'Validation suite execution', '38'],
  ];

  return {
    'Orion project plan.csv': csv(plan),
    'Orion validation log.csv': csv(validation),
    'Orion timesheet.csv': csv(timesheet),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = path.resolve(process.argv[2] || 'orion-demo');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(orionFiles())) fs.writeFileSync(path.join(out, name), text);
  console.log(`Project Orion written to ${out} — upload the folder on the Data page.`);
}
