/**
 * LOWE'S P.O. GUARD — catches material spend that never got attached to a job.
 *
 * Lowe's Pro already does the hard part. When the P.O. field is filled at
 * checkout, Lowe's stamps "PO#PH2026042" onto the subject of every email in the
 * chain — order, substitution notice, pickup, receipt — and prints "PO #:" in
 * the receipt body. The receipt scanner reads that and files the spend against
 * the job. The routine works; it just fails silently when the field is left
 * blank, and a blank field is invisible until month end.
 *
 * Observed in a single week (Gmail, 2026-08-27 to 2026-08-31):
 *   order 300901239260497837 -> PO#PH2026042  (filed correctly)
 *   order 300901242260699185 -> no P.O.       (unattributed)
 *   order 202933242262132999 -> no P.O.       (unattributed)
 *
 * This guard turns that silence into a same-day nudge. Lowe's own order email
 * says "Click Go To Order to add a PO to your order", so a miss caught within
 * the day is still fixable at the source rather than by hand in the ledger.
 */

/** Entry point. Installed on an hourly time-driven trigger. */
function runLowesPoGuard() {
  var query = [
    '(from:notifications.lowes.com OR from:confirmation.lowes.com OR from:receipt.lowes.com)',
    'newer_than:3d',
    '-label:' + CFG.LABEL_LOWES_NO_PO.replace(/\//g, '-')
  ].join(' ');

  var threads = GmailApp.search(query, 0, 50);
  if (!threads.length) return;

  var offenders = {}; // orderNumber -> {thread, subject, date}
  var alreadyFlagged = flaggedOrders_();

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var subject = msg.getSubject() || '';
      var body = safeBody_(msg);

      if (hasPurchaseOrder_(subject, body)) return;

      var orderNo = orderNumber_(subject, body);
      if (!orderNo || alreadyFlagged[orderNo] || offenders[orderNo]) return;

      offenders[orderNo] = { thread: thread, subject: subject, date: msg.getDate() };
    });
  });

  var orderNumbers = Object.keys(offenders);
  if (!orderNumbers.length) return;

  Logger.log('Lowe\'s guard: %s order(s) without a P.O.', orderNumbers.length);
  alertMissingPo_(offenders, orderNumbers);

  orderNumbers.forEach(function (no) {
    labelThread_(offenders[no].thread, CFG.LABEL_LOWES_NO_PO);
    rememberFlagged_(no);
  });
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** True when Lowe's carried a P.O. on this message, in the subject or body. */
function hasPurchaseOrder_(subject, body) {
  if (/PO\s*#\s*PH\s*-?\d{6,8}/i.test(subject)) return true;
  if (/PO\s*#\s*:?\s*PH\s*-?\d{6,8}/i.test(body)) return true;
  return false;
}

/** Lowe's order numbers run 15-18 digits. */
function orderNumber_(subject, body) {
  var m = subject.match(/#\s*(\d{15,18})/) ||
          body.match(/Order\s*#\s*:?\s*(\d{15,18})/i);
  return m ? m[1] : null;
}

function safeBody_(message) {
  try { return message.getPlainBody() || ''; } catch (err) { return ''; }
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

function alertMissingPo_(offenders, orderNumbers) {
  var openJobs = openJobsForPicklist_();

  var orderRows = orderNumbers.map(function (no) {
    var o = offenders[no];
    return '<tr>' +
      '<td style="padding:8px 14px 8px 0;font-family:monospace;color:' + BRAND.charcoal + ';">' + no + '</td>' +
      '<td style="padding:8px 14px 8px 0;color:#777;white-space:nowrap;">' + formatTs_(o.date) + '</td>' +
      '<td style="padding:8px 0;color:' + BRAND.graphite + ';">' + o.subject + '</td>' +
      '</tr>';
  }).join('');

  var jobList = openJobs.length
    ? openJobs.map(function (j) {
        return '<tr>' +
          '<td style="padding:4px 14px 4px 0;font-family:monospace;"><b>' + j.po + '</b></td>' +
          '<td style="padding:4px 14px 4px 0;color:#777;">' + j.jobId + '</td>' +
          '<td style="padding:4px 0;color:' + BRAND.graphite + ';">' + j.name + '</td>' +
          '</tr>';
      }).join('')
    : '<tr><td colspan="3" style="color:#777;padding:4px 0;">No open jobs found in the tracker.</td></tr>';

  var html =
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;color:' + BRAND.charcoal + ';">' +
    '<div style="background:' + BRAND.charcoal + ';padding:16px 20px;">' +
    '<span style="color:' + BRAND.gold + ';font-weight:bold;letter-spacing:2px;">PRESIADO HOME</span>' +
    '<span style="color:#888;letter-spacing:1px;font-size:12px;"> · LOWE\'S P.O. GUARD</span></div>' +
    '<div style="padding:20px;font-size:14px;line-height:1.6;">' +

    '<p style="margin-top:0;">' + orderNumbers.length +
    ' Lowe\'s order' + (orderNumbers.length > 1 ? 's' : '') +
    ' went through without a P.O., so the spend is not attached to a job.</p>' +

    '<table style="border-collapse:collapse;font-size:13px;margin:16px 0;">' + orderRows + '</table>' +

    '<div style="margin:20px 0;padding:16px 18px;background:' + BRAND.cream +
    ';border-left:4px solid ' + BRAND.gold + ';">' +
    '<div style="font-size:12px;letter-spacing:1px;color:#777;text-transform:uppercase;">Fix at the source</div>' +
    '<div style="margin-top:6px;">Open the order email, click <b>Go To Order</b>, and add the P.O. ' +
    'Lowe\'s will then carry it onto the receipt and the scanner files it automatically.</div>' +
    '</div>' +

    '<div style="font-size:12px;letter-spacing:1px;color:#777;text-transform:uppercase;margin-top:20px;">' +
    'Open jobs — P.O. to type</div>' +
    '<table style="border-collapse:collapse;font-size:13px;margin-top:8px;">' + jobList + '</table>' +

    '</div></div>';

  if (CFG.SIMULATE) {
    Logger.log('[SIMULATE] Lowe\'s P.O. alert for: %s', orderNumbers.join(', '));
    return;
  }
  MailApp.sendEmail({
    to: CFG.OWNER_EMAIL,
    subject: 'Lowe\'s — ' + orderNumbers.length + ' order' +
             (orderNumbers.length > 1 ? 's' : '') + ' with no P.O.',
    htmlBody: html
  });
}

/** Jobs not yet completed, with the P.O. string to type at Lowe's. */
function openJobsForPicklist_() {
  try {
    var sheet = SpreadsheetApp.openById(CFG.JOB_TRACKER_ID).getSheetByName(CFG.JOBS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return [];

    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var headers = values.shift();
    var iJob = headers.indexOf('JOB_ID');
    var iStatus = headers.indexOf('CURRENT_STATUS');
    var iName = headers.indexOf('PROJECT_NAME');
    if (iJob === -1) return [];

    return values
      .filter(function (r) {
        var id = String(r[iJob] || '');
        if (!/^PH-\d{4}-\d{3}$/.test(id)) return false;
        var status = String(iStatus === -1 ? '' : r[iStatus]).toUpperCase();
        return status.indexOf('COMPLETED') === -1 && status.indexOf('CANCEL') === -1;
      })
      .slice(-12)
      .reverse()
      .map(function (r) {
        var id = String(r[iJob]);
        return {
          jobId: id,
          po: id.replace(/-/g, ''),
          name: String(iName === -1 ? '' : r[iName]).substring(0, 60)
        };
      });
  } catch (err) {
    Logger.log('Could not build the open-job picklist: %s', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Alert de-duplication
// ---------------------------------------------------------------------------
// One order generates up to four emails. Without this the guard would nag four
// times for the same miss, and a nagging alert gets filtered into oblivion.

function flaggedOrders_() {
  var raw = PropertiesService.getScriptProperties().getProperty('LOWES_FLAGGED') || '{}';
  try { return JSON.parse(raw); } catch (err) { return {}; }
}

function rememberFlagged_(orderNumber) {
  if (CFG.SIMULATE) return;
  var flagged = flaggedOrders_();
  flagged[orderNumber] = Date.now();

  // Keep the store bounded: drop anything older than 30 days.
  var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  Object.keys(flagged).forEach(function (k) {
    if (flagged[k] < cutoff) delete flagged[k];
  });

  PropertiesService.getScriptProperties()
    .setProperty('LOWES_FLAGGED', JSON.stringify(flagged));
}
