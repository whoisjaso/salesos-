/**
 * SYNTHETIC call transcripts for the native review screen.
 *
 * Four deterministic transcripts keyed by callId, each attached to a call that
 * already exists in `obaviaDataset` with transportState "ended". Every span
 * carries a speaker label so the rule-based extractor can tell a voicemail
 * greeting from a two-way conversation. Names are the fixture's own; nothing
 * here is a real person, dealership, or recording.
 *
 * The four shapes:
 * - call_005: meaningful interaction that books a walkthrough (setter Tomasz).
 * - call_008: voicemail, rep leaves a message (setter Tomasz).
 * - call_016: meaningful, unresolved stakeholder ("my partner handles that") (setter Tomasz).
 * - call_010: meaningful, price objection the rep answers without a discount (closer Marcus).
 */
import type { TranscriptSpan } from "@/domain/callIntelligence";
import type { Id } from "@/domain/types";

export const TRANSCRIPT_LABEL = "SYNTHETIC TRANSCRIPT: invented conversation for the pilot build, not a recording.";

type Speaker = "rep" | "customer";
/** [speaker, text, seconds spoken]. */
type Line = [Speaker, string, number];

/** Sequential spans with a 400ms gap between turns. Deterministic. */
function thread(lines: Line[], startMs = 0): TranscriptSpan[] {
  let t = startMs;
  return lines.map(([speaker, text, seconds]) => {
    const span: TranscriptSpan = { startMs: t, endMs: t + seconds * 1000, text, speaker };
    t = span.endMs + 400;
    return span;
  });
}

/** call_005: Tomasz (setter) with Thaddeus Kowalczyk, Iron Horse Auto Mall. Books Thursday 9:30. */
const BOOKS: Line[] = [
  ["rep", "Hi Thaddeus, this is Tomasz with Obavia. You filled out the form on our site about follow-up for your internet leads. Do you have a couple of minutes?", 8],
  ["customer", "Yeah, I remember. Go ahead, I have a few minutes before my next appraisal.", 5],
  ["rep", "Thanks. You wrote that leads are going cold before anyone calls them. What does that look like day to day?", 7],
  ["customer", "We get maybe sixty internet leads a week across the two stores. My BDC rep calls the ones that come in during her shift. Nights and weekends just sit.", 12],
  ["rep", "So the ones that come in after six get their first call the next morning.", 5],
  ["customer", "If they get one at all. Half the time the salesperson grabs it and never logs anything.", 7],
  ["rep", "That gap is exactly what we close. Every lead gets a first touch inside five minutes, logged, and the salesperson gets the handoff with the notes.", 10],
  ["customer", "Honestly I'm not sure a text robot is what my customers want. They're buying trucks, not phones.", 8],
  ["rep", "Fair. It's not a robot conversation. It's a first reply and a time held for your team, and your people take it from there. The customer talks to a person.", 11],
  ["customer", "Okay, that makes sense. The first reply is the part we miss anyway.", 6],
  ["rep", "Who talks to those leads once they reply?", 3],
  ["customer", "Me and my sales manager split them. He runs the Kearney store.", 6],
  ["rep", "Got it. Then the walkthrough should have both of you. Marcus, our closer, does a twenty minute screen share and shows the handoff on your own leads.", 11],
  ["customer", "Twenty minutes I can do. Mornings are better, before the lot opens.", 6],
  ["rep", "How does Thursday at nine thirty Eastern sound?", 4],
  ["customer", "Thursday at nine thirty works. Send the invite to the store email, not my cell.", 7],
  ["rep", "I'll send the invite as soon as we hang up, with the store email as the main one.", 6],
  ["customer", "I'll get my sales manager on it too so we're not doing this twice.", 5],
  ["rep", "Perfect. One more thing, is there anything you want Marcus to bring so the twenty minutes is worth it?", 7],
  ["customer", "Show me what the salesperson sees. If it's another screen for them to ignore, it's dead on arrival.", 8],
  ["rep", "Noted, the salesperson view is the demo. Anything else before I let you go?", 5],
  ["customer", "No, that's it. Thursday, nine thirty. Talk then.", 4],
  ["rep", "Thanks Thaddeus, talk Thursday.", 2],
];

/** call_008: Tomasz (setter) reaches Olamide Lindqvist's voicemail at Summit & Sons Used Cars. */
const VOICEMAIL: Line[] = [
  ["customer", "Hi, you've reached Olamide at Summit and Sons Used Cars.", 3],
  ["customer", "I'm not available right now.", 2],
  ["customer", "Leave a message with your name and number and I'll call you back.", 4],
  ["customer", "Thanks.", 1],
  ["rep", "Hi Olamide, this is Tomasz with Obavia.", 3],
  ["rep", "You filled out the form on our site yesterday about follow-up on your online leads.", 5],
  ["rep", "I wanted to catch you before the weekend.", 3],
  ["rep", "Two quick things.", 1],
  ["rep", "First, nothing has been set up yet, so there's nothing you need to do.", 4],
  ["rep", "Second, I'd like ten minutes to hear how leads get handled at your store right now.", 5],
  ["rep", "No pitch on that call, just questions.", 3],
  ["rep", "You can reach me on this number, it's a direct line.", 3],
  ["rep", "Or reply to the text I'm about to send and pick a time that suits.", 4],
  ["rep", "If Friday is easier, I'm around all afternoon.", 3],
  ["rep", "If I don't hear back, I'll try you again Monday morning.", 3],
  ["rep", "Nothing urgent on my side.", 2],
  ["rep", "Again, this is Tomasz with Obavia.", 2],
  ["rep", "Have a good weekend.", 2],
  ["rep", "Take care.", 1],
  ["rep", "Bye.", 1],
];

/** call_016: Tomasz (setter) with Desmond Castellano, Harbor Point Motors. Partner decides, callback in two weeks. */
const STAKEHOLDER: Line[] = [
  ["rep", "Desmond, Tomasz from Obavia. You asked on our site how the follow-up system handles leads from your website chat. Good moment?", 8],
  ["customer", "Sure, I've got a few minutes. We're between deliveries.", 4],
  ["rep", "Tell me about the chat leads. What happens after someone types in a question at night?", 6],
  ["customer", "It goes to a shared inbox. Whoever opens first in the morning answers it. By then they've usually bought somewhere else.", 9],
  ["rep", "So the first reply is the whole problem.", 3],
  ["customer", "Pretty much. We've got one rooftop, twelve people on the floor, and nobody owns the inbox.", 7],
  ["rep", "That's the same story we hear from single-store groups. The system answers inside five minutes and assigns it to a person by name.", 9],
  ["customer", "I'm worried about another tool nobody logs into. We tried something before and it died in a month.", 8],
  ["rep", "What did the last one ask your people to do?", 3],
  ["customer", "Log into a dashboard and update statuses. Nobody did it.", 5],
  ["rep", "Ours asks nothing of the floor. The setter handles the reply and the appointment, and the salesperson gets a text with the notes.", 9],
  ["customer", "That's better. But I don't sign for software. My partner handles that, and the budget, and he's on vacation.", 9],
  ["rep", "Got it. When is he back?", 2],
  ["customer", "Two weeks. And he'll want to see numbers, not a pitch.", 5],
  ["rep", "Then let's not waste your time with a walkthrough he's not on. What's the best way to loop him in?", 7],
  ["customer", "Let me talk to him first. If he's open to it, I'll get you both on a call.", 6],
  ["rep", "Fair. Should I check in after he's back?", 3],
  ["customer", "Yeah, call me back in two weeks. Don't send him anything before I've talked to him.", 7],
  ["rep", "I won't. Two weeks from today, I'll call you at this number.", 5],
  ["customer", "Good. And if he says no, I'll tell you straight so you're not chasing.", 6],
  ["rep", "Appreciated. One question so the call is worth his time: is your chat tool the one built into the site, or a separate vendor?", 9],
  ["customer", "Separate. It's the one the website company bundled in. I couldn't tell you the name.", 7],
  ["rep", "No problem, I'll look it up from the site before I call.", 4],
  ["customer", "Alright. Talk in two weeks.", 2],
  ["rep", "Talk then, Desmond.", 2],
];

/** call_010: Marcus (closer) with Bartholomew Haddad, Ridgeline Auto Group. Price objection, no discount, breakdown sent at list. */
const PRICE: Line[] = [
  ["rep", "Bartholomew, Marcus with Obavia. Priya set this up after your discovery call. I've got the notes in front of me. Ready when you are.", 9],
  ["customer", "Ready. I've got about fifteen minutes, so keep it tight.", 4],
  ["rep", "Then let's start with what you told Priya. Four stores, one BDC, and the two smaller stores get their leads a day late.", 9],
  ["customer", "That's right. We run four rooftops and the BDC sits at the flagship. The satellite stores are on their own after five.", 10],
  ["rep", "Here's what the system does on a lead that comes in at eight at night at your Pueblo store.", 6],
  ["customer", "Go ahead.", 1],
  ["rep", "It replies inside five minutes from your number, holds a time, and texts the salesperson on shift the next morning with the customer's own words.", 11],
  ["customer", "And the salesperson doesn't have to log anything?", 3],
  ["rep", "Nothing. The reply and the appointment are logged for them. They show up and sell.", 6],
  ["customer", "Okay. What does it cost?", 2],
  ["rep", "Four thousand eight hundred, one time, for the first store. A second rooftop is nineteen hundred. Onboarding on site is seven fifty if you want us there.", 12],
  ["customer", "That's too expensive for what it is. My website guy said he could bolt on an auto-reply for a few hundred bucks.", 9],
  ["rep", "He might be right about the auto-reply. What's the auto-reply going to do at eight at night when the customer answers back?", 8],
  ["customer", "Nothing, I guess. It sends one text.", 3],
  ["rep", "That's the difference. The first reply is cheap. The second one, from a person, inside the hour, is what gets the appointment. That's what you're paying for.", 11],
  ["customer", "I hear you. I'm still not sure the number's right for four stores.", 6],
  ["rep", "I'm not going to move the number. What I can do is show you what one store did in its first sixty days and let you decide if the second store earns its keep.", 12],
  ["customer", "Fine. Send me the numbers from that store and the breakdown for four rooftops, and I'll take it to my partner.", 9],
  ["rep", "I'll send the breakdown at list, with the second store and onboarding as separate lines, so what he sees is what he'd sign.", 9],
  ["customer", "And if he says it's too much?", 2],
  ["rep", "Then you tell me which store you'd start with, and we run one. Nobody needs four on day one.", 7],
  ["customer", "That helps, actually. One store first is an easier conversation.", 5],
  ["rep", "I'll have it in your inbox before end of day. Which email?", 4],
  ["customer", "The dealer group one, not the flagship store. My office manager screens the other.", 6],
  ["rep", "Got it. And I'll call the week after so you've had time to read it.", 5],
  ["customer", "Do that. Thanks Marcus.", 2],
  ["rep", "Thanks, Bartholomew.", 2],
];

/** Transcripts keyed by the callId they belong to in `obaviaDataset.calls`. */
export const transcripts: Record<Id, TranscriptSpan[]> = {
  call_005: thread(BOOKS),
  call_008: thread(VOICEMAIL),
  call_016: thread(STAKEHOLDER),
  call_010: thread(PRICE),
};

/** Stable order for lists and tests: the booking call first. */
export const TRANSCRIPT_CALL_IDS: Id[] = ["call_005", "call_008", "call_016", "call_010"];

export function transcriptFor(callId: Id): TranscriptSpan[] | undefined {
  return transcripts[callId];
}
