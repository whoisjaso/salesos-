/**
 * Sample exports for the migration (import) engine. Three realistic files as
 * a business would hand them over: a HubSpot contacts+deals export, a
 * GoHighLevel contacts export, and a messy hand-kept spreadsheet.
 *
 * Each file has: one person appearing twice (must fold into one contact),
 * one row with no phone or email (must be an error), one refund written in
 * parentheses, one STOP / DND / do-not-text person, and dates in mixed
 * formats (ISO, US, "Sep 3, 2026", epoch seconds, 2-digit year).
 *
 * All people are fictional; numbers use the 555 range.
 */
import type { User } from "@/domain/types";

/** "Now" for import tests; appointment dates after this are future. */
export const MIGRATION_NOW = "2026-09-19T12:00:00Z";
export const MIGRATION_TENANT = "t_migrate";

export const migrationUsers: User[] = [
  { tenantId: MIGRATION_TENANT, userId: "u_jordan", displayName: "Jordan Lee", roles: ["closer"], active: true, languages: ["en"], capabilities: [], startedAt: "2025-01-06T00:00:00Z" },
  { tenantId: MIGRATION_TENANT, userId: "u_sam", displayName: "Sam Rivera", roles: ["setter"], active: true, languages: ["en", "es"], capabilities: [], startedAt: "2025-03-03T00:00:00Z" },
];

/** HubSpot contacts export joined with deal columns. "Unsubscribed from all email" is HubSpot's consent property. */
export const HUBSPOT_CSV = [
  "First Name,Last Name,Phone Number,Email,Company name,Lifecycle Stage,Deal Stage,Amount,Close Date,Contact owner,Create Date,Unsubscribed from all email",
  'Maria,Gonzalez,(512) 555-0142,maria.g@example.com,Gonzalez Auto,customer,closedwon,"$4,800.00",2026-08-20,Jordan Lee,2026-08-01T14:22:00Z,false',
  "Devon,Price,512-555-0177,devon.price@example.com,Price Motors,lead,appointmentscheduled,,,Jordan Lee,08/03/2026,false",
  'Aisha,Khan,+1 512 555 0198,aisha.khan@example.com,,opportunity,closedlost,"2,400",2026-08-18,Sam Rivera,"Aug 4, 2026",false',
  'Tom,Nguyen,5125550101,tom.nguyen@example.com,Nguyen Fleet,customer,closedwon,"$3,200",8/22/2026,Sam Rivera,1754400000,false',
  "Maria,Gonzalez,5125550142,mgonzalez@other.com,Gonzalez Auto,customer,closedwon,(200),2026-09-01,Jordan Lee,2026-08-01T14:22:00Z,false",
  ",Prospect,,,Acme Leasing,lead,qualifiedtobuy,,,Jordan Lee,2026-08-06,false",
  "Lena,Fischer,(512) 555-0133,lena.f@example.com,,subscriber,,,,Casey Morgan,2026-08-07,false",
  'Raj,Patel,512.555.0155,raj@example.com,Patel Group,lead,presentationscheduled,"$1,000",2026-09-25,Sam Rivera,2026-08-08,false',
  'Chloe,Baker,(512) 555-0166,chloe.b@example.com,,lead,,,,Jordan Lee,"Sep 2, 2026",true',
  'Marcus,Hill,(512) 555-0188,marcus.hill@example.com,Hill Trucking,customer,closedwon,"$6,500.00",9/10/2026,Jordan Lee,2026-08-12 09:15,false',
].join("\r\n");

/** GoHighLevel contacts export with opportunity and appointment columns. DND is GHL's do-not-disturb flag. */
export const GOHIGHLEVEL_CSV = [
  "Contact Name,Phone,Email,Tags,Source,Pipeline Stage,Appointment Status,Appointment Time,Assigned To,Date Added,DND,Lead Value",
  'Maria Gonzalez,(512) 555-0142,maria.g@example.com,"fb-lead,hot",Facebook Ads,Won,Showed,"Sep 3, 2026 10:00 AM",Jordan Lee,2026-08-01T14:22:00Z,false,"$4,800"',
  "Devon Price,512-555-0177,devon.price@example.com,ig,Instagram,Booked,Confirmed,09/28/2026 2:30 PM,Jordan Lee,08/03/2026,false,",
  'Aisha Khan,+1 512 555 0198,aisha.khan@example.com,,Referral,Lost,No Show,2026-08-18T15:00:00Z,Sam Rivera,"Aug 4, 2026",false,',
  'Tom Nguyen,5125550101,tom.nguyen@example.com,vsl,VSL,Won,Showed,8/22/2026 11:00 AM,Sam Rivera,1754400000,false,"3,200"',
  "M. Gonzalez,,maria.g@example.com,,Facebook Ads,Won,,,Jordan Lee,2026-08-15,false,(150)",
  "Walk-in,,,,Walk in,New,,,Jordan Lee,2026-08-16,false,",
  "Lena Fischer,(512) 555-0133,lena.f@example.com,,Google,Nurture,Cancelled,2026-08-20 09:00,Casey Morgan,2026-08-07,false,",
  'Chloe Baker,(512) 555-0166,chloe.b@example.com,stop,Instagram,DQ,,,Jordan Lee,"Sep 2, 2026",true,',
  "Raj Patel,512.555.0155,raj@example.com,,Facebook Ads,Appointment Booked,Rescheduled,2026-09-10 3:00 PM,Sam Rivera,2026-08-08,false,",
  'Marcus Hill,(512) 555-0188,marcus.hill@example.com,fleet,Referral,Won,Showed,2026-09-12T16:00:00Z,Jordan Lee,2026-08-12 09:15,false,"$6,500.00"',
].join("\n");

/** A hand-kept sheet with odd headers. "Cell" is only recognizable by its values. */
export const MESSY_CSV = [
  "Name,Cell,E-mail,Where from,Booked?,Showed?,$ Paid,Notes,Do not text",
  'Maria Gonzalez,512-555-0142,maria.g@example.com,Facebook,9/3/2026 10am,yes,"$4,800.00",Bought the fleet package,no',
  'Devon Price,(512) 555-0177,devon.price@example.com,Instagram,"Sep 28, 2026 2:30 PM",,,Wants pricing first,no',
  "Aisha Khan,512.555.0198,aisha.khan@example.com,Referral,8/18/26,no,,Went with competitor,no",
  "Tom Nguyen,512 555 0101,tom.nguyen@example.com,VSL,2026-08-22,yes,3200,,no",
  "Maria G,512-555-0142,,Facebook,,,(200),Refund partial,no",
  "Mystery caller,,,Phone,,,,Called once and left no number,no",
  "Lena Fischer,512-555-0133,lena.f@example.com,Google,2026-08-20 09:00,cancelled,,,no",
  "Chloe Baker,512-555-0166,chloe.b@example.com,Instagram,,,,STOP,yes",
  "Raj Patel,512-555-0155,raj@example.com,Facebook,1757520000,rescheduled,,,no",
  'Marcus Hill,512-555-0188,marcus.hill@example.com,Referral,"Sep 12, 2026",yes,"$6,500",Fleet of 12,no',
].join("\n");

export const MIGRATION_FIXTURES = {
  hubspot: HUBSPOT_CSV,
  gohighlevel: GOHIGHLEVEL_CSV,
  messy: MESSY_CSV,
} as const;
