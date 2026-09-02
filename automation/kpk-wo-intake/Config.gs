/**
 * KPK WO INTAKE — Configuration and trigger installation.
 *
 * Presiado Home Improvement LLC
 * Lane: Operations. Canonical IDs mirrored from the office doctrine (Seccion 10).
 *
 * Owner rule (Francisco, 2026-09-02): "toda WO es un job aprobado."
 * A Kirkplan work order is not a lead and not a proposal. It arrives already won,
 * so intake creates the job immediately instead of waiting for a close step.
 */

var CFG = {

  // ---- Canonical systems ------------------------------------------------
  JOB_TRACKER_ID: '11eaQ8xCIGhUd0L8wdHMZT-0Dw5peM48Pl_xotNXnWOg',
  JOBS_TAB: 'JOBS',

  FINANCE_OS_ID: '1ayuUKEz1oewiwCCujgWODxzsMR2xbkYdSaaYdWei8PM',
  FIN_JOBS_TAB: 'FIN_JOBS',

  ACTIVE_PROJECTS_FOLDER: '1pOY_d2lcRTYRz1rzVWA4faHRkKhqwKml',

  // ---- Identity ---------------------------------------------------------
  OWNER_EMAIL: 'francisco@presiadohomegroup.com',
  OWNER_NAME: 'Francisco Presiado',
  OWNER_TITLE: 'Director of Sales & Projects',
  COMPANY: 'Presiado Home Improvement LLC',
  // Trust line is fixed by the brand guide. "Insured" is the only trust word
  // permitted for Presiado — never "Licensed" in any form (FS 489 exposure).
  TRUST_LINE: 'Painting · Drywall · Remodeling | Sarasota, FL · Insured',
  PHONE: '(941) 704-3464',
  WEB: 'presiadohomegroup.com',

  // ---- Kirkplan ---------------------------------------------------------
  KPK_DOMAIN: 'kirkplankitchens.com',
  // Kirkplan's client id in the JOBS tab. Verified against rows PH-2026-006
  // and PH-2026-008, both SOURCE_TYPE=KIRKPLAN_WO.
  KPK_CLIENT_ID: 'CLT-2026-0006',
  KPK_SOURCE_TYPE: 'KIRKPLAN_WO',

  // ---- Legacy vigilante -------------------------------------------------
  // "automatizacion kirtplan kitchen OT" (script 137-gV7syJ...) archives every
  // Kirkplan attachment into a flat per-sender folder and stamps the thread
  // with LEGACY_ATTACH_LABEL. Its query excludes that label, so stamping it
  // ourselves means the old script skips whatever we already filed — the two
  // never fight over the same work order.
  //
  // Verified 2026-09-02: its last saved file is dated 2026-06-06. Becker
  // (8/21), Wright (8/26) and McClain (9/2) are all absent from its folder, so
  // it has not run in about three months. Whether its trigger still exists is
  // not visible from outside the script project.
  LEGACY_ATTACH_LABEL: 'Adjuntos Guardados - Directo',
  KPK_ARCHIVE_FOLDER: '1FKHro8YvZe8CrCowIk28WPM-H7wwSp-z',
  // The job folder is the correct home for a work order. Turn this on only if
  // the flat per-sender archive is still wanted as a mirror.
  MIRROR_TO_LEGACY_ARCHIVE: false,

  // ---- Gmail labels -----------------------------------------------------
  LABEL_DONE: 'KPK/WO-Intake-Done',
  LABEL_ERROR: 'KPK/WO-Intake-Error',
  LABEL_LOWES_NO_PO: 'Lowes/Missing-PO',

  // ---- Behaviour --------------------------------------------------------
  // Look-back window for the Gmail sweep. Wide enough to survive a few hours
  // of trigger downtime, narrow enough not to re-scan the whole mailbox.
  SEARCH_WINDOW: '7d',

  // Attempt to pull the property address out of the WO PDF via Drive OCR.
  // On failure the address stays [REQUIERE_REVISION] — never guessed.
  ENABLE_PDF_OCR: true,

  // Dry run: log every write instead of performing it. Flip to true to
  // rehearse against live data without touching the sheet, Drive or Gmail.
  SIMULATE: false
};

/** Brand colors, for the internal HTML alerts. */
var BRAND = {
  charcoal: '#1C1C1C',
  gold: '#C6A768',
  offWhite: '#F8F7F4',
  graphite: '#333333',
  cream: '#F5F0E6'
};

/**
 * One-time setup. Run manually from the Apps Script editor.
 * Creates the labels and installs both time-driven triggers.
 */
function installTriggers() {
  [CFG.LABEL_DONE, CFG.LABEL_ERROR, CFG.LABEL_LOWES_NO_PO].forEach(function (name) {
    if (!GmailApp.getUserLabelByName(name)) {
      GmailApp.createLabel(name);
      Logger.log('Created label: ' + name);
    }
  });

  var wanted = ['runKpkWoIntake', 'runLowesPoGuard'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (wanted.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // The acknowledgment is the whole point of the 5-minute cadence: a work
  // order that lands at 12:08 is answered before the PM has left the thread.
  ScriptApp.newTrigger('runKpkWoIntake').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('runLowesPoGuard').timeBased().everyHours(1).create();

  Logger.log('Triggers installed: runKpkWoIntake (5 min), runLowesPoGuard (1 h)');
}

/** Removes every trigger this project owns. */
function uninstallTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('All triggers removed.');
}
