export type Speaker = "YOU" | "RAMEN" | "SENTINEL" | "WATCHER" | "THE HUNGER";

export type VoiceLine = {
  id: string;
  speaker: Speaker;
  text: string;
  file: string;
  mood: string;
  /** IndexTTS2 `emo_text` — paste this, not the spoken line. */
  emo_text: string;
  emo_alpha: number;
};

/** IndexTTS2: Text description (`use_emo_text=True`). Keep `emo_audio_prompt` empty. */
export const TTS_METHOD = {
  mode: "use_emo_text" as const,
  emo_alpha: 0.55,
  note: "Do not auto-detect emotion from the spoken line. Short horror lines read as calm.",
};

export const SPEAKER_REF = {
  YOU: "ref_you.mp3",
  RAMEN: "ref_ramen.mp3",
  SENTINEL: "ref_sentinel.mp3",
  WATCHER: "ref_watcher.wav",
  "THE HUNGER": "ref_hunger.wav",
} as const;

/** Drop generated files in src/soundassets matching `file` (wav, or mp3 with the same stem). */
export const VOICE_LINES = [
  { id: "you_okay", speaker: "YOU", text: "Okay.", file: "you_okay.wav", mood: "tired calm", emo_alpha: 0.45, emo_text: "Quiet tired young adult, close mic, trying to stay calm, small breath, not smiling." },
  { id: "you_okay_again", speaker: "YOU", text: "Okay. Again.", file: "you_okay_again.wav", mood: "tired resigned", emo_alpha: 0.5, emo_text: "Same tired walker, worn down, resigned, still quiet, no panic." },
  { id: "you_later", speaker: "YOU", text: "It's later than I thought.", file: "you_later.wav", mood: "tired uneasy", emo_alpha: 0.5, emo_text: "Tired, muttering to self, slight unease, close mic, not loud." },
  { id: "you_fog", speaker: "YOU", text: "The fog tastes like the kitchen.", file: "you_fog.wav", mood: "unsettled whisper", emo_alpha: 0.55, emo_text: "Quiet observation, unsettled, almost whispering, no joke in the voice." },
  { id: "you_hands", speaker: "YOU", text: "My hands are already shaking.", file: "you_hands.wav", mood: "tense fear", emo_alpha: 0.6, emo_text: "Admitting fear, still trying to keep volume low, tense but not crying." },
  { id: "you_wet", speaker: "YOU", text: "The asphalt is wet. It wasn't raining.", file: "you_wet.wav", mood: "uneasy flat", emo_alpha: 0.55, emo_text: "Noticing something wrong, careful, uneasy, flat delivery." },
  { id: "you_warm", speaker: "YOU", text: "The bowl is still warm. Too warm.", file: "you_warm.wav", mood: "quiet dread", emo_alpha: 0.55, emo_text: "Quiet dread on the last two words, close mic, not theatrical." },
  { id: "you_yeah", speaker: "YOU", text: "Yeah.", file: "you_yeah.wav", mood: "tired under-breath", emo_alpha: 0.4, emo_text: "Short, tired, agreeing just to stop talking, almost under the breath." },
  { id: "you_count", speaker: "YOU", text: "I already counted the lamps. There are more now.", file: "you_count.wav", mood: "trying not to panic", emo_alpha: 0.6, emo_text: "Trying to stay logical, fear leaking in, not shouting." },
  { id: "you_home", speaker: "YOU", text: "I'm just walking home.", file: "you_home.wav", mood: "defensive polite", emo_alpha: 0.5, emo_text: "Defensive, polite, hoping that ends the conversation." },
  { id: "you_not_leaving", speaker: "YOU", text: "I'm not leaving anything.", file: "you_not_leaving.wav", mood: "scared firm", emo_alpha: 0.5, emo_text: "Firm but quiet, a little too fast, scared of the watchman." },
  { id: "you_didnt_blink", speaker: "YOU", text: "He never blinked.", file: "you_didnt_blink.wav", mood: "aftershock whisper", emo_alpha: 0.62, emo_text: "Aftershock, whispering to self, skin-crawl, not a scream." },
  { id: "you_evening", speaker: "YOU", text: "Good evening.", file: "you_evening.wav", mood: "forced polite", emo_alpha: 0.4, emo_text: "Forced politeness, matching the stranger, slight tightness in the throat." },
  { id: "you_ramen", speaker: "YOU", text: "Ramen.", file: "you_ramen.wav", mood: "cautious", emo_alpha: 0.4, emo_text: "One word answer, cautious, doesn't want to explain." },
  { id: "you_soup", speaker: "YOU", text: "It's soup.", file: "you_soup.wav", mood: "unconvincing", emo_alpha: 0.45, emo_text: "Trying to make it ordinary, not convincing, quiet." },
  { id: "you_bowl_talk", speaker: "YOU", text: "Did the bowl just—", file: "you_bowl_talk.wav", mood: "startled", emo_alpha: 0.7, emo_text: "Startled interruption, cut off, breathy, not yelling." },
  { id: "you_heard", speaker: "YOU", text: "I think I heard something.", file: "you_heard.wav", mood: "afraid listening", emo_alpha: 0.58, emo_text: "Listening, afraid to be right, close whisper." },
  { id: "you_not_mine", speaker: "YOU", text: "Those footsteps aren't mine.", file: "you_not_mine.wav", mood: "certain fear", emo_alpha: 0.65, emo_text: "Certainty and fear together, still quiet, walking while talking." },
  { id: "you_nothing", speaker: "YOU", text: "There's nothing—", file: "you_nothing.wav", mood: "scared lie", emo_alpha: 0.72, emo_text: "Lying to himself, voice cracking on the cut-off, scared." },
  { id: "you_what_see", speaker: "YOU", text: "What would I see?", file: "you_what_see.wav", mood: "hushed dread", emo_alpha: 0.55, emo_text: "Doesn't really want the answer, hushed, curious in a bad way." },
  { id: "you_rock", speaker: "YOU", text: "I've seen that rock before.", file: "you_rock.wav", mood: "disoriented", emo_alpha: 0.6, emo_text: "Disoriented, trying not to panic, muttering." },
  { id: "you_how_long", speaker: "YOU", text: "How long have I been walking.", file: "you_how_long.wav", mood: "exhausted lost", emo_alpha: 0.55, emo_text: "Exhausted, not really asking anyone, lost." },
  { id: "you_what_was", speaker: "YOU", text: "What was that.", file: "you_what_was.wav", mood: "afterscare", emo_alpha: 0.7, emo_text: "After a scare, breathy, one beat too late, not a scream." },
  { id: "you_name", speaker: "YOU", text: "Did you say my name?", file: "you_name.wav", mood: "thin unease", emo_alpha: 0.68, emo_text: "Unsettled, accusing the bowl, voice thin." },
  { id: "you_no", speaker: "YOU", text: "No—", file: "you_no.wav", mood: "sudden fear", emo_alpha: 0.75, emo_text: "Sudden fear, cut off, sharp inhale, still not a movie scream." },
  { id: "you_face", speaker: "YOU", text: "I know that face.", file: "you_face.wav", mood: "recognition horror", emo_alpha: 0.72, emo_text: "Recognition horror, quiet, sick, close to the mic." },
  { id: "you_chicken", speaker: "YOU", text: "...chicken.", file: "you_chicken.wav", mood: "hesitant lie", emo_alpha: 0.55, emo_text: "Hesitant lie, pause before the word, trying to sound sure and failing." },
  { id: "you_why", speaker: "YOU", text: "Why.", file: "you_why.wav", mood: "hollow", emo_alpha: 0.5, emo_text: "Hollow, tired, one word, no energy left." },
  { id: "you_light", speaker: "YOU", text: "I can see the light.", file: "you_light.wav", mood: "cautious relief", emo_alpha: 0.5, emo_text: "Relief held back, still afraid it isn't real." },
  { id: "you_light_moved", speaker: "YOU", text: "The light moved.", file: "you_light_moved.wav", mood: "hushed dread", emo_alpha: 0.7, emo_text: "Dread, reporting a fact that shouldn't be true, hushed." },
  { id: "you_almost", speaker: "YOU", text: "Almost there.", file: "you_almost.wav", mood: "breathless", emo_alpha: 0.45, emo_text: "Breathless, encouraging himself, quiet." },
  { id: "you_just_ramen", speaker: "YOU", text: "It's just ramen.", file: "you_just_ramen.wav", mood: "soft denial", emo_alpha: 0.5, emo_text: "Trying to make it small, not believing it, soft." },

  { id: "ramen_dont_spill", speaker: "RAMEN", text: "Don't spill me.", file: "ramen_dont_spill.wav", mood: "intimate wrong-calm", emo_alpha: 0.6, emo_text: "Intimate voice in the ear, too calm, slightly wrong, not cute, even and close." },
  { id: "ramen_deal", speaker: "RAMEN", text: "Twenty minutes. Then you eat. That was the deal.", file: "ramen_deal.wav", mood: "even instructional", emo_alpha: 0.55, emo_text: "Patient, instructional, unnervingly even, like a reminder not a joke." },
  { id: "ramen_easy", speaker: "RAMEN", text: "Easy.", file: "ramen_easy.wav", mood: "soft correction", emo_alpha: 0.5, emo_text: "Soft correction, close to the ear, almost kind, slightly off." },
  { id: "ramen_tilting", speaker: "RAMEN", text: "You're tilting.", file: "ramen_tilting.wav", mood: "matter-of-fact", emo_alpha: 0.55, emo_text: "Matter of fact, intimate, no panic, a little too aware of the body." },
  { id: "ramen_left", speaker: "RAMEN", text: "Left. No—level.", file: "ramen_left.wav", mood: "calm correction", emo_alpha: 0.55, emo_text: "Correcting mid-word, still calm, close mic, not rushed." },
  { id: "ramen_hey", speaker: "RAMEN", text: "Hey.", file: "ramen_hey.wav", mood: "intimate wrong", emo_alpha: 0.58, emo_text: "Getting attention from inside the bowl, intimate, wrong, not friendly-cute." },
  { id: "ramen_level", speaker: "RAMEN", text: "Keep me level. Look only when you have to.", file: "ramen_level.wav", mood: "controlling calm", emo_alpha: 0.55, emo_text: "Quiet instruction, controlling, close, unblinking calm." },
  { id: "ramen_counting", speaker: "RAMEN", text: "He was counting your steps.", file: "ramen_counting.wav", mood: "pleased whisper", emo_alpha: 0.62, emo_text: "Sharing a secret, pleased in a wrong way, still a whisper." },
  { id: "ramen_with_us", speaker: "RAMEN", text: "Something is walking with us.", file: "ramen_with_us.wav", mood: "calm danger", emo_alpha: 0.65, emo_text: "Calm announcement of danger, no comfort, intimate." },
  { id: "ramen_wind", speaker: "RAMEN", text: "It's just the wind. Probably.", file: "ramen_wind.wav", mood: "cold reassurance", emo_alpha: 0.55, emo_text: "Reassurance that doesn't believe itself, the last word colder." },
  { id: "ramen_dont_look", speaker: "RAMEN", text: "Don't look behind you.", file: "ramen_dont_look.wav", mood: "urgent whisper", emo_alpha: 0.7, emo_text: "Urgent whisper, still close, no shout, command not suggestion." },
  { id: "ramen_said_dont", speaker: "RAMEN", text: "I said don't.", file: "ramen_said_dont.wav", mood: "quiet anger", emo_alpha: 0.78, emo_text: "Anger without raising the voice, intimate, clipped, dangerous." },
  { id: "ramen_not_anymore", speaker: "RAMEN", text: "Not anymore.", file: "ramen_not_anymore.wav", mood: "cold final", emo_alpha: 0.65, emo_text: "Final, cold, close to the ear, no sympathy." },
  { id: "ramen_good_walk", speaker: "RAMEN", text: "Good. Keep walking.", file: "ramen_good_walk.wav", mood: "leash calm", emo_alpha: 0.5, emo_text: "Approval that feels like a leash, calm, intimate." },
  { id: "ramen_remember", speaker: "RAMEN", text: "Nothing you want to remember.", file: "ramen_remember.wav", mood: "gentle wrong", emo_alpha: 0.6, emo_text: "Soft warning, almost gentle, wrong." },
  { id: "ramen_gaps", speaker: "RAMEN", text: "They live in the gaps between the lamps.", file: "ramen_gaps.wav", mood: "ominous story", emo_alpha: 0.62, emo_text: "Storytelling in the ear, unhurried, ominous, not theatrical." },
  { id: "ramen_road", speaker: "RAMEN", text: "The road remembers everyone who runs.", file: "ramen_road.wav", mood: "old knowledge", emo_alpha: 0.6, emo_text: "Old knowledge, calm, slightly pleased." },
  { id: "ramen_how_long", speaker: "RAMEN", text: "Longer than twenty minutes. Don't check.", file: "ramen_how_long.wav", mood: "forbidding", emo_alpha: 0.58, emo_text: "Knows more than it should, intimate, forbidding." },
  { id: "ramen_dont_answer", speaker: "RAMEN", text: "Don't answer it.", file: "ramen_dont_answer.wav", mood: "sharp whisper", emo_alpha: 0.68, emo_text: "Sharp whisper command, still close, no panic in the timbre." },
  { id: "ramen_dont_thank", speaker: "RAMEN", text: "Don't thank them.", file: "ramen_dont_thank.wav", mood: "ritual quiet", emo_alpha: 0.62, emo_text: "Rule-giving, quiet, like a ritual, not cute." },
  { id: "ramen_names", speaker: "RAMEN", text: "I can say names I was never given.", file: "ramen_names.wav", mood: "uncanny proud", emo_alpha: 0.7, emo_text: "Uncanny, intimate, a little proud, not human-careful." },
  { id: "ramen_faster", speaker: "RAMEN", text: "Walk faster. But not too fast. You know what happens.", file: "ramen_faster.wav", mood: "coach threat", emo_alpha: 0.6, emo_text: "Coach and threat together, even, close mic." },
  { id: "ramen_second_look", speaker: "RAMEN", text: "Still don't look.", file: "ramen_second_look.wav", mood: "tighter warning", emo_alpha: 0.68, emo_text: "Repeat warning, tighter, still a whisper." },
  { id: "ramen_tray", speaker: "RAMEN", text: "Keep the bowl on the tray. Don't look at it.", file: "ramen_tray.wav", mood: "urgent control", emo_alpha: 0.7, emo_text: "During a scare, urgent but not shouting, controlling." },
  { id: "ramen_wanted_me", speaker: "RAMEN", text: "It didn't want you. It wanted me.", file: "ramen_wanted_me.wav", mood: "flattered calm", emo_alpha: 0.6, emo_text: "Matter of fact after violence, intimate, almost flattered." },
  { id: "ramen_try_again", speaker: "RAMEN", text: "It will try again if you run.", file: "ramen_try_again.wav", mood: "calm warning", emo_alpha: 0.58, emo_text: "Warning with no comfort, calm, close." },
  { id: "ramen_warm", speaker: "RAMEN", text: "Because I'm warm. Because I'm full. Because I remember being eaten.", file: "ramen_warm.wav", mood: "wrong confession", emo_alpha: 0.68, emo_text: "Confession, slow, sensual in a wrong way, not cute, low." },
  { id: "ramen_eat_you", speaker: "RAMEN", text: "If you spill me they will eat you instead.", file: "ramen_eat_you.wav", mood: "helpful threat", emo_alpha: 0.65, emo_text: "Calm threat, helpful tone, intimate." },
  { id: "ramen_almost", speaker: "RAMEN", text: "Almost there.", file: "ramen_almost.wav", mood: "too-calm guide", emo_alpha: 0.5, emo_text: "Soft, guiding, still too calm." },
  { id: "ramen_not_porch", speaker: "RAMEN", text: "That's not the porch yet.", file: "ramen_not_porch.wav", mood: "cold certain", emo_alpha: 0.68, emo_text: "Correcting hope, cold, close, certain." },
  { id: "ramen_focus", speaker: "RAMEN", text: "Don't get distracted now.", file: "ramen_focus.wav", mood: "tight whisper", emo_alpha: 0.55, emo_text: "Tight instruction, still a whisper." },
  { id: "ramen_good", speaker: "RAMEN", text: "You've been good to me.", file: "ramen_good.wav", mood: "possessive affection", emo_alpha: 0.6, emo_text: "Affection that feels like ownership, intimate, slow." },
  { id: "ramen_no_isnt", speaker: "RAMEN", text: "No. It isn't.", file: "ramen_no_isnt.wav", mood: "gentle wrong", emo_alpha: 0.62, emo_text: "Final correction, gentle and wrong, close to the ear." },

  { id: "sentinel_excuse", speaker: "SENTINEL", text: "Excuse me.", file: "sentinel_excuse.wav", mood: "dry formal", emo_alpha: 0.4, emo_text: "Dry roadside watchman, formal, unblinking, no smile, even volume." },
  { id: "sentinel_all_say", speaker: "SENTINEL", text: "That's what they all say.", file: "sentinel_all_say.wav", mood: "dry contempt", emo_alpha: 0.45, emo_text: "Same formal watchman, faintly contemptuous, no warmth, no rush." },
  { id: "sentinel_name", speaker: "SENTINEL", text: "The last person who carried something warm down this road left their name in me.", file: "sentinel_name.wav", mood: "dry report", emo_alpha: 0.5, emo_text: "Formal, unblinking, reporting a fact, no melody, slightly too long a breath." },
  { id: "sentinel_keep", speaker: "SENTINEL", text: "I still have it. In case they come back.", file: "sentinel_keep.wav", mood: "dry possessive", emo_alpha: 0.5, emo_text: "Dry, possessive, no smile, like a clerk of the dead." },
  { id: "sentinel_already", speaker: "SENTINEL", text: "You already have.", file: "sentinel_already.wav", mood: "dry certain", emo_alpha: 0.55, emo_text: "Quiet certainty, formal, the last word lands and stays." },
  { id: "sentinel_warm", speaker: "SENTINEL", text: "Warm things don't last on this road.", file: "sentinel_warm.wav", mood: "dry almost-kind", emo_alpha: 0.5, emo_text: "Unblinking, almost kind, which makes it worse, flat affect." },

  { id: "watcher_evening", speaker: "WATCHER", text: "Good evening.", file: "watcher_evening.wav", mood: "too polite", emo_alpha: 0.45, emo_text: "Polite stranger, too polite, even volume, no hurry, slight smile you can't hear." },
  { id: "watcher_carrying", speaker: "WATCHER", text: "What are you carrying?", file: "watcher_carrying.wav", mood: "focused polite", emo_alpha: 0.5, emo_text: "Polite interest that is too focused, even, no small talk warmth." },
  { id: "watcher_asked", speaker: "WATCHER", text: "That's not what I asked.", file: "watcher_asked.wav", mood: "polite correction", emo_alpha: 0.55, emo_text: "Still polite, correction with no anger, which is worse, even volume." },
  { id: "watcher_is_it", speaker: "WATCHER", text: "Is it?", file: "watcher_is_it.wav", mood: "still polite", emo_alpha: 0.58, emo_text: "Two words, too still, polite disbelief, no rush." },
  { id: "watcher_careful", speaker: "WATCHER", text: "Be careful with the lid. Things climb out.", file: "watcher_careful.wav", mood: "helpful wrong", emo_alpha: 0.6, emo_text: "Helpful stranger, too specific, even, no laugh." },
  { id: "watcher_again", speaker: "WATCHER", text: "We keep meeting people who are almost home.", file: "watcher_again.wav", mood: "unhurried we", emo_alpha: 0.58, emo_text: "Polite, plural we, unhurried, like this happens every night." },

  { id: "hunger_beef", speaker: "THE HUNGER", text: "Is that beef?", file: "hunger_beef.wav", mood: "wet curious", emo_alpha: 0.7, emo_text: "Large wet hungry voice, low, not human-careful, close and wet, curious." },
  { id: "hunger_smell", speaker: "THE HUNGER", text: "I can smell the egg from here.", file: "hunger_smell.wav", mood: "wet pleased", emo_alpha: 0.72, emo_text: "Hungry, wet, pleased, low, too close, not careful." },
  { id: "hunger_liar", speaker: "THE HUNGER", text: "Liar.", file: "hunger_liar.wav", mood: "wet angry", emo_alpha: 0.82, emo_text: "Sudden anger, still low, wet, one word like a bite." },
  { id: "hunger_share", speaker: "THE HUNGER", text: "Share.", file: "hunger_share.wav", mood: "wet demand", emo_alpha: 0.8, emo_text: "Demand, hungry, wet, not asking, low." },
  { id: "hunger_pork", speaker: "THE HUNGER", text: "I prefer pork.", file: "hunger_pork.wav", mood: "wet satisfied", emo_alpha: 0.65, emo_text: "After feeding, low, satisfied, wet, almost polite again." },
] as const satisfies readonly VoiceLine[];

export type LineId = (typeof VOICE_LINES)[number]["id"];

const BY_ID = new Map<string, (typeof VOICE_LINES)[number]>(VOICE_LINES.map((line) => [line.id, line]));

export function getLine(id: LineId) {
  const line = BY_ID.get(id);
  if (!line) throw new Error(`missing line ${id}`);
  return line;
}

export const VOICE_NOTES: Record<Speaker, string> = {
  YOU: "Tired walker, quiet, close-mic, 20s–30s, trying to stay calm.",
  RAMEN: "Intimate, almost in the ear, too calm, slightly wrong. Not cute.",
  SENTINEL: "Dry roadside watchman. Formal. Unblinking. No smile.",
  WATCHER: "Polite stranger. Too polite. Even volume. No hurry.",
  "THE HUNGER": "Large, wet, hungry. Low. Not human-careful.",
};

export const YOU_ASIDES = ["you_fog", "you_hands", "you_wet"] as const satisfies readonly LineId[];
export const RAMEN_ASIDES = ["ramen_easy", "ramen_tilting", "ramen_left"] as const satisfies readonly LineId[];
