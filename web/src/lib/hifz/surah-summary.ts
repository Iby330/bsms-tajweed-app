/**
 * Short summaries of each surah in the memorisation run, written for
 * beginners.
 *
 * WHERE THE CONTENT COMES FROM. The substance is drawn from Sayyid Abul A'la
 * Maududi's Tafhim al-Qur'an (via the Quran.com API, kept in
 * surah-detail.json) — the occasion of revelation, the period, and the theme.
 * The wording is not his. Tafhim is a scholarly commentary written for readers
 * with grounding, and quoting it directly produced paragraphs of dispute
 * between commentators that this programme's students have no use for.
 *
 * WHAT THEY ARE FOR. A student memorising a surah should know what they are
 * memorising: roughly when it came, what prompted it, and what it is saying.
 * Two paragraphs. No verse-by-verse tafsir. Where the Qur'an warns, the
 * summary says so plainly rather than dwelling on it — the aim is a student
 * who understands the surah, not one who is frightened of it.
 *
 * REVIEW STATUS. `REVIEWED` is false. These were drafted by an assistant
 * working from Tafhim, not written by a scholar, and the page marks every one
 * of them as a draft until that changes. Someone qualified at BSMS should read
 * all 43 and then flip the flag.
 *
 * `revealedIn` is NOT restated here — it comes from surah-info.ts, so the two
 * cannot disagree. `dispute` carries a one-line note only where scholars are
 * commonly reported to differ, including the few places where Tafhim's view
 * and the API's field do not match.
 */

export const REVIEWED = false;

export type SurahSummary = {
  /** two paragraphs: where it came from, and what it says */
  paragraphs: [string, string];
  /** a single line, only where a difference of opinion is commonly reported */
  dispute?: string;
};

export const SURAH_SUMMARY: Record<number, SurahSummary> = {
  72: {
    paragraphs: [
      "Revealed in Makkah. The Prophet ﷺ was travelling with some of his companions and stopped to lead the dawn prayer at a place called Nakhlah. A group of jinn passing by heard the Qur'an being recited, stayed to listen, and went back to their own people to tell them what they had found.",
      "Most of the surah is their own words, quoted back to us. They describe a recitation unlike anything they had heard, and they correct beliefs their people had held for generations. The striking thing is that they were convinced by hearing it alone — no messenger had been sent to them, and nobody argued them into it.",
    ],
  },
  73: {
    paragraphs: [
      "Revealed in Makkah near the very beginning of the Prophet's ﷺ mission. He is addressed by how he was at that moment — wrapped in his cloak — and told to rise and pray through part of the night. The last verse came much later, in Madinah, easing the length of that night prayer.",
      "The opening verses set out what the night was for: preparing to carry something heavy. Standing in prayer, reciting unhurriedly, and being patient with what people said are given as the way to build the strength the work would need. It is a surah about getting ready more than about the task itself.",
    ],
  },
  74: {
    paragraphs: [
      "Among the earliest revelations in Makkah. After the first five verses of Al-'Alaq, revelation paused for a time. When it returned, these verses came — again finding the Prophet ﷺ wrapped in a cloak, and this time telling him to get up and warn.",
      "This is where the public call begins, and the instructions are practical: rise, warn, keep yourself clean, be patient, and do not give in order to receive more back. The later part describes a man who heard the Qur'an, privately recognised its power, and rejected it anyway rather than lose face.",
    ],
  },
  75: {
    paragraphs: [
      "One of the earliest surahs revealed in Makkah, when the idea of being raised again after death was being openly mocked. People asked how scattered bones could ever be gathered.",
      "It answers directly: the One who shaped a person from a drop can restore them down to their fingertips. Along the way the Prophet ﷺ is told not to hurry his tongue over the revelation — it would be preserved for him without effort. The surah is honest about the moment of death, but its subject is really that nothing anyone does is lost or forgotten.",
    ],
  },
  76: {
    paragraphs: [
      "Describes the human being from the very start: a time when he was not something worth mentioning, then a drop, then given hearing and sight and shown the way. What he does with that is left to him.",
      "Most of the surah then describes what is prepared for those who kept their word and fed the poor, the orphan and the captive — saying plainly that they wanted no thanks and no reward in return. The descriptions of the Garden are unhurried and gentle, and they are the point of the surah rather than a note at the end of it.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  77: {
    paragraphs: [
      "Revealed in the earliest period at Makkah, alongside the surahs around it that deal with the same subject. It belongs to a run of revelations that came quickly, one after another.",
      "It opens with an oath by the winds sent forth, and argues from them: the One who set this system running in the world is not going to be unable to bring about another. One line returns through the surah after each sign — woe that Day to those who denied it — which makes it memorable, and which is part of why it reads as a warning rather than a lecture.",
    ],
  },
  78: {
    paragraphs: [
      "Revealed early in Makkah. People were arguing among themselves about what the Prophet ﷺ had brought, and the surah opens by asking what all the questioning is actually about.",
      "The answer is the great news of the Day people were refusing to accept. It then points at ordinary things — the earth spread out, mountains set as pegs, sleep given as rest, night as a covering — and lets them make the case: whoever arranged all this can certainly raise the dead. It ends with the Day itself, and with a person wishing they had prepared.",
    ],
  },
  79: {
    paragraphs: [
      "Revealed in Makkah shortly after An-Naba, on the same subject. Both belong to the period when the Resurrection was the main point of dispute between the Prophet ﷺ and the people of Makkah.",
      "It opens with oaths by the angels who take souls at death, and makes a quiet argument from them: those who can draw a soul out today can return it tomorrow. The middle of the surah tells the story of Musa and Pharaoh — a man who was given a clear sign, and who chose to think himself above it. The end asks about the Hour and answers that its knowledge belongs to God alone.",
    ],
  },
  80: {
    paragraphs: [
      "Revealed in Makkah on a known occasion. The Prophet ﷺ was in the middle of speaking to some of the leading men of Quraysh, hoping they would accept Islam, when a blind man came and interrupted him with a question. He turned away from him.",
      "The surah opens by correcting that. Read as a whole, though, the displeasure falls on the chiefs rather than on the Prophet ﷺ — men who were treated as important, and who were rejecting the truth out of arrogance, while the one genuinely seeking it was the one waved aside. It is a surah about who is actually worth attending to.",
    ],
  },
  81: {
    paragraphs: [
      "One of the earliest surahs revealed at Makkah. It was said that whoever wants to see the Day of Judgement as though with their own eyes should read this surah and the two that follow it.",
      "The first verses undo the world piece by piece: the sun folded up, the stars falling, the mountains moved, the seas boiling over. Then the second half turns to where the Qur'an came from — brought by a noble messenger, not something invented, and not the words of a madman as they were claiming. It ends by asking simply: where are you going?",
    ],
  },
  82: {
    paragraphs: [
      "Revealed in Makkah in the same period as At-Takwir, which it closely resembles. The two were sent down at about the same time and cover the same ground.",
      "It describes the sky splitting, the seas overflowing and the graves overturned, and then makes it personal: on that Day every soul will know exactly what it sent ahead and what it left behind. It also mentions the honourable ones who write down what we do — a reminder that nothing goes unrecorded, and that the record is not written by someone careless.",
    ],
  },
  83: {
    paragraphs: [
      "Revealed early in Makkah, at a time when the surahs coming down were pressing the reality of the Hereafter on people who were dismissing it.",
      "It begins with one everyday dishonesty: traders who demand full measure when receiving, and give short when they hand over. The surah treats that as a symptom rather than the disease — people cheat in small ways because they do not really believe they will be asked about it. From there it sets the record of the wicked beside the record of the righteous, and what each will find.",
    ],
  },
  84: {
    paragraphs: [
      "Another of the earliest Makkan surahs. At this point the Muslims were not yet being persecuted, but the message was being openly rejected in Makkah.",
      "It describes the sky splitting and the earth flattening out and emptying itself, and gives a reason for it: because their Lord commanded them, and they obeyed, as is only right. Then it turns to us — every person is working towards their Lord and will meet Him — and describes the two ways a record may be handed over. It closes by asking why, when the signs are this plain, people still do not believe.",
    ],
  },
  85: {
    paragraphs: [
      "Revealed in Makkah when persecution of the Muslims was at its worst, and the disbelievers were using force to turn new converts away from Islam.",
      "It tells of an earlier people who dug a trench, lit a fire in it, and threw believers into it for no reason except that they believed. The surah is addressed to both sides at once: a warning to those doing the persecuting, and a consolation to those enduring it — that this has happened before, that God saw it, and that He is the Forgiving, the Loving, whose grip is not weak.",
    ],
  },
  86: {
    paragraphs: [
      "Revealed at Makkah when the Quraysh were trying every plan they could think of to stop the Qur'an spreading.",
      "It swears by the night-comer, the piercing star, and points out that nothing exists without a guardian over it. Then it asks a person to look at what they were made from, and draws the obvious conclusion: the One who brought you from that can certainly bring you back. It ends by saying the Qur'an is a decisive word, and that whatever plans are made against it, God has a plan too.",
    ],
  },
  87: {
    paragraphs: [
      "One of the earliest surahs revealed. Verse 6 — that the Prophet ﷺ would be enabled to recite and would not forget — suggests it came at a stage when he was still anxious about holding on to what was being revealed.",
      "It has three strands: glorifying God's name and keeping it free of anything unworthy; instructions to the Prophet ﷺ to remind, because the reminder benefits whoever is willing to hear it; and a plain comparison at the end — people prefer this life, while the Hereafter is better and lasting. It closes by noting this was in the earlier scriptures too, of Ibrahim and Musa.",
    ],
  },
  88: {
    paragraphs: [
      "Revealed early at Makkah, once the Prophet ﷺ had begun preaching publicly and people were hearing the message for the first time.",
      "It opens by asking whether news of the overwhelming event has reached you, then shows two faces side by side: one worn out and weary, and one content with its striving. Having pictured both ends, it turns to things anyone can look at — the camel, the sky, the mountains, the earth — and asks how they were made. The point is not to threaten but to invite a person to look, and think.",
    ],
  },
  89: {
    paragraphs: [
      "Revealed at Makkah when persecution of new Muslims had begun. The peoples named in it were held up to Quraysh deliberately.",
      "After swearing by the dawn and the ten nights, it recalls 'Ad, Thamud and Pharaoh — three peoples who had strength and were confident in it, and who are gone. Then it turns to how people behave with money: pleased when given plenty, resentful when given less, while neglecting the orphan and not urging one another to feed the poor. It ends beautifully, with the soul at peace being called home.",
    ],
  },
  90: {
    paragraphs: [
      "Revealed at Makkah in the period when the Quraysh had decided to oppose the Prophet ﷺ openly.",
      "It swears by the city itself, then says something honest: the human being was created into hardship, and life is not meant to be easy. It asks whether he thinks nobody has power over him, and whether he thinks nobody sees. Then it names the steep path most people do not attempt — freeing a slave, feeding the hungry on a day of famine, an orphan or someone in the dust — and adds that it also means being among those who urge one another to patience and mercy.",
    ],
  },
  91: {
    paragraphs: [
      "Revealed in the earliest period at Makkah, when opposition to the Prophet ﷺ had become strong.",
      "It swears eleven times — by the sun, the moon, the day, the night, the sky, the earth, and finally the soul itself and how it was shaped — and every oath leads to one point: whoever purifies their soul has succeeded, and whoever buries it has failed. The story of Thamud follows, as an example of a people who were shown clearly what to do and chose otherwise.",
    ],
  },
  92: {
    paragraphs: [
      "Revealed in Makkah around the same time as Ash-Shams, which it closely resembles. Each surah reads like an explanation of the other.",
      "Its subject is that people's efforts genuinely differ — as different as night from day. One person gives, is mindful of God, and believes in the best reward; another withholds, and thinks he needs nothing from anyone. Both are made easy towards where they are heading. It ends with the one who gives his wealth to purify himself, seeking nothing but the face of his Lord, and who will certainly be pleased.",
    ],
  },
  93: {
    paragraphs: [
      "Revealed at Makkah after revelation had stopped coming for a period. The Prophet ﷺ was distressed by the silence, and people had begun to say that his Lord had abandoned him.",
      "The answer is gentle and personal: by the morning light and the stillness of night, your Lord has not left you and is not displeased with you. It reminds him of his own life — an orphan who was sheltered, lost who was guided, in need who was enriched — and then turns those three into instructions: so do not be harsh with the orphan, do not turn away the one who asks, and speak about the favour of your Lord.",
    ],
  },
  94: {
    paragraphs: [
      "Revealed in Makkah in the same period and the same circumstances as Ad-Duha, and it reads as a continuation of it. Before his call the Prophet ﷺ had been widely respected; afterwards the same society turned against him.",
      "It reminds him of what had already been done for him — his chest expanded, the burden that weighed on his back lifted, his name raised — and then gives the promise it is best known for, said twice rather than once: with hardship comes ease. It ends practically: when you are free, work on, and turn to your Lord.",
    ],
  },
  95: {
    paragraphs: [
      "Held by most scholars to be Makkan. It swears by the fig and the olive, by Mount Sinai, and by the secure city — places associated with earlier prophets and with Makkah itself.",
      "Its point is about the human being: created in the best form, and then brought down to the lowest of the low — except those who believe and do good, for whom there is a reward without end. It closes by asking what, after all this, could make someone still deny the Judgement, and whether God is not the most just of judges.",
    ],
    dispute: "Most scholars hold it to be Makkan; some report it as Madinan.",
  },
  96: {
    paragraphs: [
      "The first five verses are the very first revelation the Prophet ﷺ received, in the cave of Hira. The rest of the surah came later, in Makkah.",
      "It begins with a command to read in the name of the Lord who created, and who taught by the pen what a person did not know — the first word of the Qur'an being about knowledge. The later verses describe a man who saw someone praying and tried to stop him, and warn him that God sees. It ends with an instruction to prostrate and draw near, which is why a sajdah is made here.",
    ],
  },
  97: {
    paragraphs: [
      "Placed straight after Al-'Alaq, which is meaningful: that surah carries the first revelation, and this one tells us the night it came down on.",
      "It says the Qur'an was sent down on the Night of Decree, and that this night is better than a thousand months. The angels and the Spirit descend on it with every matter, and it is peace until the break of dawn. Read while memorising, its point is about the worth of what you are memorising — this is not an ordinary book, and it did not arrive on an ordinary night.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  98: {
    paragraphs: [
      "Its placement after Al-'Alaq and Al-Qadr is deliberate: those explain what was revealed and when, and this one explains why a messenger had to be sent with it at all.",
      "It says people — those with earlier scriptures and those without — were not going to be left as they were until clear evidence reached them: a messenger reciting purified pages. It then states what religion actually asks for, in one plain sentence: sincerity in worship, upright prayer, and giving charity. It ends with the best of creation and their reward.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  99: {
    paragraphs: [
      "A short surah about the second life and the record of what a person did. Scholars report it as both Makkan and Madinan.",
      "The earth is shaken with its final shaking and throws out its burdens, and a person asks what is happening to it. Then the surah does something remarkable: it says the earth will report its news, because your Lord inspired it to. The ground you walked on becomes a witness. It ends with the line most people know — whoever does an atom's weight of good will see it, and whoever does an atom's weight of evil will see it.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  100: {
    paragraphs: [
      "Revealed against the background of Arabia at the time, where raiding between tribes was constant and bloodshed was ordinary. The opening oaths — galloping horses, striking sparks, raising dust at dawn — would have been an everyday sight.",
      "From that it turns to the human being: ungrateful to his Lord, and himself a witness to that; and fierce in his love of wealth. The closing verses ask whether he knows what happens when the graves are emptied and what is in the hearts is brought out — not only what people did, but what they kept hidden inside.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  101: {
    paragraphs: [
      "Undisputedly Makkan, and among the earliest revealed. Its subject is the Day of Judgement.",
      "It opens by naming the event three times over, so that the listener stops and pays attention, then gives two images: people scattered like moths around a light, and mountains like carded wool. After that it becomes very simple — deeds are weighed, and whoever's scales are heavy is in a life that pleases them. The surah is short, and its brevity is part of how it lands.",
    ],
  },
  102: {
    paragraphs: [
      "Makkan, according to the commentators. It names a very ordinary problem: competing over who has more.",
      "Piling up wealth and status, and comparing yourself with others, keeps people occupied until they reach the graves — and the phrase used means it distracts them from what actually matters, not that having things is itself the sin. The surah then repeats a warning twice for emphasis, and ends by saying you will be asked, on that Day, about the blessings you enjoyed.",
    ],
  },
  103: {
    paragraphs: [
      "Held by most commentators to be Makkan, and among the earliest. It is three verses long.",
      "Swearing by time itself, it states that the human being is in loss — and then makes four exceptions: those who believe, do good, urge one another to truth, and urge one another to patience. Imam ash-Shafi'i said that if people considered only this surah, it would be enough to guide them. The last two conditions are worth noticing: they are not things you can do alone.",
    ],
    dispute: "Most commentators hold it to be Makkan; Mujahid, Qatadah and Muqatil are reported to have held it Madinan.",
  },
  104: {
    paragraphs: [
      "Agreed to be Makkan, and one of the earliest. It describes faults that everyone in that society recognised as faults — nobody was defending them.",
      "It warns the one who slanders and mocks people behind their backs, and who counts his wealth over and over as if it will make him last forever. The surah's answer is direct: it will not. What is being condemned is a particular character — using money and words to make yourself big by making others small.",
    ],
  },
  105: {
    paragraphs: [
      "Unanimously Makkan, and revealed very early. It recalls the army that came with an elephant to destroy the Ka'bah in the year the Prophet ﷺ was born.",
      "The event is described in five short verses because it needed no explanation: everyone in Makkah knew it had happened, and the Quraysh themselves believed the Ka'bah had been protected by God rather than by any idol. The surah simply asks: did you not see what your Lord did with them? Their plan was made useless, and the ones who thought themselves unstoppable were undone.",
    ],
  },
  106: {
    paragraphs: [
      "Makkan, according to a large majority of commentators — the words 'Lord of this House' point to Makkah plainly. It follows directly from Al-Fil, and reads as its conclusion.",
      "It reminds the Quraysh of what they already enjoyed: the safety and standing that let their trading caravans travel in winter and summer without being touched. The argument is quiet and hard to refuse — you already agree this House belongs to God rather than to idols, and you know who fed you against hunger and made you safe from fear, so worship Him.",
    ],
  },
  107: {
    paragraphs: [
      "Revealed at Makkah. Its subject is what a person becomes when the Hereafter means nothing to them.",
      "It asks who really denies the Judgement, and the answer is not someone who argues about it but someone who pushes an orphan aside and does not encourage feeding the poor. The last verses turn to people who do pray, but who are heedless of it, who are only seen to be praying, and who withhold even small everyday kindnesses. The surah measures belief by how someone treats other people.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  108: {
    paragraphs: [
      "Makkan, according to the majority. It is the shortest surah in the Qur'an — three verses.",
      "It was revealed when the Prophet ﷺ was being mocked for having no surviving son, with people saying his name would end with him. The reply is that he has been given al-Kawthar, abundance, and that it is the one taunting him who will be cut off. In between comes an instruction: so pray to your Lord, and sacrifice. The answer to being belittled is to turn back to worship.",
    ],
  },
  109: {
    paragraphs: [
      "Revealed at Makkah, when the Quraysh proposed a compromise: that each side take turns practising the other's religion for a year.",
      "The surah refuses that, clearly and without hostility. It separates the two things completely — what you worship and what I worship are not the same, and there is no way of blending them — and then ends without argument or insult: for you your religion, and for me mine. It draws a line rather than picking a fight.",
    ],
    dispute: "Most report it as Makkan; some reports say Madinan.",
  },
  110: {
    paragraphs: [
      "Reported by Ibn 'Abbas to be the last complete surah revealed, near the end of the Prophet's ﷺ life, when Makkah had been opened and people were entering Islam in large numbers.",
      "It tells him that when the help of God and the victory come, and he sees people entering the religion in crowds, the mission he was sent for has been completed. And then, at the very moment of success, it commands something unexpected: praise your Lord, and ask His forgiveness. Not celebration — gratitude, and turning back to God.",
    ],
  },
  111: {
    paragraphs: [
      "Makkan. It concerns Abu Lahab, the Prophet's ﷺ own uncle, who opposed him openly and persistently, and his wife, who is described as carrying firewood.",
      "It is unusual in naming a living opponent and stating his end while he was still alive and able to disprove it — and he never did. Read alongside the surahs around it, it makes a point about closeness: being related to the Prophet ﷺ was worth nothing without belief, and neither wealth nor what he earned was going to help him.",
    ],
  },
  112: {
    paragraphs: [
      "Revealed in answer to a question about who exactly this God being preached about was — people at the time worshipped gods with bodies, families, parents and children, who needed food and drink.",
      "The reply is four verses that rule all of that out: He is One; He is the One everything turns to and depends on; He did not father and was not fathered; and there is nothing at all comparable to Him. The Prophet ﷺ described this surah as equal to a third of the Qur'an — one of the reasons it is among the first surahs almost every Muslim learns.",
    ],
    dispute: "Scholars differ on where it was revealed; both Makkah and Madinah are reported.",
  },
  113: {
    paragraphs: [
      "Revealed at Makkah, in the period when opposition to the Prophet ﷺ had grown intense and hostility towards him was coming from several directions at once.",
      "It is a prayer for refuge with the Lord of the daybreak — from the harm of everything He made, from the night when it grows dark, and from envy when the envier envies. With An-Nas after it, the two are known as the Mu'awwidhatayn, the two surahs of seeking refuge, and they were revealed as a pair.",
    ],
    dispute: "Most report the pair as Makkan; some reports say Madinan.",
  },
  114: {
    paragraphs: [
      "Revealed at Makkah alongside Al-Falaq, under the same conditions. The two were sent down together and are almost always recited together.",
      "Where Al-Falaq seeks refuge from harm that comes from outside, this one seeks refuge from harm that comes from within — the whisperer who withdraws, who whispers into people's chests. It calls on God by three names in turn: Lord of mankind, King of mankind, God of mankind, so that the one asking knows exactly who they are asking.",
    ],
    dispute: "Most report the pair as Makkan; some reports say Madinan.",
  },
};
