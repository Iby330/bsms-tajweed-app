/**
 * Short summaries of each surah in the memorisation run (67 to 114).
 *
 * WHO THEY ARE FOR. Students with little or no background. That drives every
 * choice here:
 *
 *  · No source is named in the text. A student does not know what Tafhim
 *    al-Qur'an is, so "Tafhim suggests" tells them nothing and makes the
 *    sentence harder. Attribution belongs in this comment and in the UI's
 *    source line, not mid-paragraph.
 *  · One narration, not four. Where several chains report the same occasion,
 *    the best known is given and the rest left out. Listing them is how a
 *    commentary establishes a point; it is not how you teach one.
 *  · Background is explained rather than assumed. If a summary mentions the
 *    opening of Makkah, it says why the Muslims were in Madinah in the first
 *    place. If it mentions the boycott, it says what the boycott was.
 *
 * WHERE THE CONTENT COMES FROM. Sayyid Abul A'la Maududi's Tafhim al-Qur'an,
 * via the Quran.com API, kept in surah-detail.json: occasion of revelation,
 * period, and theme. The wording is not his.
 *
 * HOUSE STYLE. No em dashes.
 *
 * REVIEW STATUS. `REVIEWED` is false and the page says so on every surah.
 * Drafted by an assistant, not a scholar. Someone qualified at BSMS should
 * read all 48, paying particular attention to the narrations and to the
 * historical background, which is summarised here at second hand.
 *
 * `revealedIn` comes from surah-info.ts and is not restated. `dispute` is a
 * plain sentence, without chains of names.
 */

export const REVIEWED = false;

export type SurahSummary = {
  /** two paragraphs: where it came from, and what it says */
  paragraphs: [string, string];
  /** what a Muslim student in a western university can take from it */
  reflection: string;
  /** plain language, no lists of narrators */
  dispute?: string;
};

export const SURAH_SUMMARY: Record<number, SurahSummary> = {
  67: {
    paragraphs: [
      "One of the earliest surahs revealed in Makkah. There is no reliable report of exactly when it came down, but its style places it early, in the period when the whole of Islam was being put to people in short, striking surahs rather than explained at length.",
      "It opens by saying that all control rests with Allah, who created death and life in order to test which of us acts best. Then it asks the reader to look up at the sky and find a single flaw in it, and to look again, because the eye will come back tired having found nothing. Near the end it asks a question that is genuinely difficult to answer: if the water you drink sank away into the ground, who exactly would bring it back to you? The Prophet ﷺ said this surah pleads on behalf of whoever recites it until they are forgiven.",
    ],
    reflection:
      "It asks you to look up and actually examine what you see, which is worth remembering at a university that often treats faith as something inherited rather than thought about. The test it names is not who achieves most but who acts best, and that is a different scoreboard from the one campus runs on.",
  },
  68: {
    paragraphs: [
      "Among the very earliest surahs revealed, but from a point where opposition in Makkah had turned harsh. The leaders of the city were telling people that the Prophet ﷺ had lost his mind, which was an effective way of stopping anyone taking him seriously.",
      "It swears by the pen and by what is written, then answers that accusation directly: you are not mad, and you are upon a great standard of character. In the middle is a story about the owners of an orchard who agreed to harvest it at first light, deliberately early so that the poor would not see them and could not ask for anything. They arrived to find it stripped bare. The surah ends by telling the Prophet ﷺ to wait patiently for his Lord's judgement.",
    ],
    reflection:
      "Being called strange for praying, fasting or not drinking is a mild version of what this surah answers. Its reply is not an argument but a character: you are upon a great standard. People change their minds about Islam far more often through how a Muslim behaves in a seminar or a flatshare than through anything said in a debate.",
  },
  69: {
    paragraphs: [
      "One of the earliest surahs, from the stage when opposition had begun but had not yet turned violent. Umar ibn al-Khattab, who later became the second caliph but at that time was still hostile to Islam, said that he once came upon the Prophet ﷺ reciting this surah, and hearing it was part of what eventually changed his mind.",
      "Its name means the reality, and the surah names it three times at the start to make the listener stop. It recalls earlier peoples who denied what they were told and what became of them, then describes the Day itself and the moment each person is handed their record, either in the right hand or the left, along with what each of them says at that moment. The second half insists that the Qur'an is not the work of a poet or a fortune teller, but revelation from the Lord of all the worlds.",
    ],
    reflection:
      "Everything you do this term is being written down, and one day it is handed to you. That is worth sitting with before a night out you are unsure about, or a piece of work you were tempted to fake. Not as fear, but as a simple question: would you want this page read back?",
  },
  70: {
    paragraphs: [
      "Revealed in Makkah in conditions much like those of Surah Al-Haqqah. People there had begun mocking the warnings about the Day of Judgement, and one of them demanded sarcastically that if this punishment were real it should simply arrive now.",
      "The surah opens with that very demand and then answers it. It describes a day on which the angels ascend, whose measure is fifty thousand years, and tells the Prophet ﷺ to be patient with a beautiful patience. It then describes the human being as anxious by nature, panicking when something bad touches him and clutching tight when good comes his way, and makes an exception for those who pray and who set aside a known share of their wealth for the one who asks and the one who is too proud to ask.",
    ],
    reflection:
      "It describes a person who panics the moment something goes wrong and clamps shut the moment something goes right, which is a recognisable state during exams and job applications. The exception it names is not people with better nerves. It is people who pray consistently and who give part of what they have away.",
  },
  71: {
    paragraphs: [
      "Revealed in Makkah once opposition to the Prophet ﷺ had become strong and organised. It tells the story of Nuh, a prophet sent long before, who called his people for a very long time and was answered by almost none of them.",
      "He describes how he called them by night and by day, in public and in private, and how they put their fingers in their ears and pulled their clothes over their heads rather than listen. He points them upwards at the moon and the sun, and reminds them that they themselves were grown out of the earth. The story is not told for its own sake. The people of Makkah are being shown that they are behaving exactly as Nuh's people behaved, and warned that the ending need not be different.",
    ],
    reflection:
      "Nuh called people for a very long time and almost nobody answered. If you have a family member who does not pray, or a friend who is drifting, this surah is honest with you: your job is to keep calling with patience, and the results were never yours to deliver.",
  },
  72: {
    paragraphs: [
      "Revealed in Makkah. The Prophet ﷺ was travelling with some companions and stopped at a place called Nakhlah to lead the dawn prayer. A group of jinn passing by heard the Qur'an being recited and stopped to listen. Jinn are a creation made from smokeless fire, who live alongside us but are not normally seen. No prophet had been sent to them, and they had no warning that any of this was coming.",
      "Most of the surah is their own words, repeated back to us after they returned to their people. They say they heard a wonderful recitation that guides to what is right, that they believed in it, and that they will never again set up partners alongside their Lord. They also correct ideas their own people had held for generations. Nobody argued them into any of it. Hearing the Qur'an was enough.",
    ],
    reflection:
      "They were convinced simply by hearing the Qur'an, with nobody arguing them into it. It is worth asking when you last sat and listened to it properly rather than reading about Islam online. The thing you are memorising has its own effect, and that effect gets lost if it becomes background noise.",
  },
  73: {
    paragraphs: [
      "Revealed in Makkah very early, when the Prophet ﷺ had only just begun receiving revelation and had not yet started preaching openly. He is addressed by how he was at that moment, wrapped in his cloak, and told to stand in prayer for about half the night. The final verse came years later in Madinah and made that much easier, because the community could not keep it up.",
      "The reason for the night prayer is given plainly: a weighty word was about to be placed on him, and the night is when the heart is most focused and words come out straightest. Alongside prayer he is told to recite slowly and carefully, to be patient with what people say about him, and to leave those who reject him to Allah. The surah is about getting ready for the work, not about the work itself.",
    ],
    reflection:
      "The night was given to him before the hard work started, not after. Building something private and consistent, even ten minutes before sleep, is what makes the demanding weeks survivable. Most students try to build it during the crisis instead, which is exactly when it is hardest to start.",
  },
  74: {
    paragraphs: [
      "One of the earliest revelations. After the first five verses of Surah Al-Alaq, revelation stopped for a time. When it returned, the Prophet ﷺ saw again the angel who had come to him in the cave, went home shaken, and asked his family to cover him with a cloak. These verses came while he lay there.",
      "This is where the public call begins, and the instructions are short and practical. Get up. Warn people. Declare the greatness of your Lord. Keep your clothes clean. Be patient. Do not give something in order to get more back. The later part of the surah describes a man who listened to the Qur'an, thought about it carefully, and then called it magic handed down from others, because admitting what he had heard would have cost him his position among his people.",
    ],
    reflection:
      "One line here is easy to miss: do not give in order to receive more back. In a place where networking and favours are how things move, it is a quiet instruction to do things without keeping a ledger of what people owe you.",
  },
  75: {
    paragraphs: [
      "One of the earliest surahs revealed in Makkah, at a time when the idea of being brought back to life after death was being openly laughed at. The objection people raised was a practical one. Once a body has decayed and the bones are scattered, how could anyone possibly put it back together?",
      "The surah answers that head on. Allah is able not only to gather the bones but to restore the very tips of the fingers, which are different in every single person. In the middle there is an instruction to the Prophet ﷺ not to rush his tongue trying to hold on to the revelation as it came, because collecting it and making it clear was Allah's responsibility, not his. The surah ends by describing the moment the soul reaches the collarbone and a person leaves this world.",
    ],
    reflection:
      "The instruction not to rush is aimed at someone anxious about holding on to something precious. If you are worried about forgetting what you have memorised, or falling behind, this surah says the securing of it was never entirely on you. Do the work carefully and stop panicking about the outcome.",
  },
  76: {
    paragraphs: [
      "The surah begins with the human being before he existed at all. There was a long stretch of time when he was not anything worth mentioning. Then he was made from a mixed drop of fluid, and given hearing and sight. Having been shown the road, he either takes it and is grateful, or refuses it. The choice is genuinely left to him.",
      "Most of what follows describes people who keep their promises and give food away even though they want it themselves, feeding the poor, the orphan and the prisoner, and saying: we are feeding you only for the sake of Allah, we do not want any payment from you or even any thanks. What they receive in return is described slowly and at length, and those descriptions are the real substance of the surah rather than a note at the end.",
    ],
    reflection:
      "They fed people while wanting the food themselves, and said plainly that they wanted no thanks for it. That is a hard standard in an age where good deeds are photographed. The test is simple enough: would you still have done it if nobody was ever going to know?",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  77: {
    paragraphs: [
      "Revealed in the earliest period in Makkah, in a run of surahs that all press the same point. At this stage the Prophet ﷺ was warning people that this world will end and another life will follow, and most of Makkah was refusing to accept it.",
      "The surah opens with an oath by the winds sent out across the earth, and makes an argument from them. Whoever set up a system like this one is not going to be unable to bring about another. One sentence comes back after each stage of the argument, ten times in total: woe that day to those who denied it. That repetition is part of why the surah stays in the memory, and it is why it reads as a series of warnings rather than a lecture.",
    ],
    reflection:
      "The warning repeats ten times, and repetition is the point. Some things you know perfectly well and still do not act on. Reading this surah is a reminder that being told once is rarely what changes anyone, including you.",
  },
  78: {
    paragraphs: [
      "Revealed early in Makkah. At that point the Prophet's ﷺ message came down to three things: that nobody shares in Allah's divinity, that he had been sent as a messenger, and that this world will end and everyone will be raised again. It was the third that people argued about most, and they were asking each other about it constantly.",
      "The surah opens by asking what all this questioning is about, then answers with a list of ordinary things nobody disputes. The earth spread out like a bed. Mountains set into it like pegs. Night as a covering. Sleep as rest. The sun as a blazing lamp. The argument it builds is simple: whoever arranged all of that can certainly bring you back. It ends with a person on that day wishing he had sent something ahead of himself.",
    ],
    reflection:
      "It points at sleep, at night, at mountains, at the sun, things you walk past every day without a second thought. University trains you to analyse everything except what is directly in front of you. Ten seconds of actually looking at the sky is a practice this surah is asking for.",
  },
  79: {
    paragraphs: [
      "Revealed in Makkah shortly after Surah An-Naba, continuing the same argument with the same people.",
      "It opens with oaths by the angels who take souls at the moment of death and who carry out Allah's commands, and the argument is hidden inside the oath itself. Those who can draw a soul out of a body today can just as easily put one back tomorrow. The middle of the surah tells of Musa being sent to Pharaoh, the ruler of Egypt, who was shown a clear sign and responded by gathering his people and announcing that he was their highest lord. The surah ends by saying that only Allah knows when the Hour will come.",
    ],
    reflection:
      "Pharaoh's problem was not ignorance, it was that he had power and no limit above himself. Ambition is not the danger here; ambition with nothing above it is. Worth thinking about when planning a career that will reward you for exactly that attitude.",
  },
  80: {
    paragraphs: [
      "Some of the leading men of Makkah were sitting with the Prophet ﷺ while he was doing his best to persuade them to accept Islam. A blind man named Ibn Umm Maktum, who had already become Muslim, came up and interrupted with a question about his religion. The Prophet ﷺ found the interruption unwelcome and turned away from him.",
      "The surah opens by correcting that, then widens out. Read as a whole, the real criticism falls on the chiefs. They were being given time and attention while rejecting the truth out of pride, and the one person genuinely trying to learn was the one waved aside. Ibn Umm Maktum was honoured afterwards, and the Prophet ﷺ is reported to have greeted him by saying: welcome to the one on whose account my Lord corrected me.",
    ],
    reflection:
      "He gave attention to the important men and waved away the person who genuinely wanted to learn, and Allah corrected him for it. Notice who you make time for on campus, and whether it tracks with who is useful to you. The quiet person nobody is talking to is usually the one this surah has in mind.",
  },
  81: {
    paragraphs: [
      "One of the earliest surahs revealed in Makkah. The Prophet ﷺ said that whoever wants to see the Day of Resurrection as though he were watching it with his own eyes should read this surah and the two that come after it.",
      "The first verses take the world apart piece by piece. The sun folded up, the stars falling, the mountains moved, the pregnant camels left untended, the seas boiling over. Among them is a question that would have stopped the Arabs of that time in their tracks, about the baby girl buried alive being asked what she was killed for, because burying unwanted daughters was something that actually happened then. The second half of the surah turns to where the revelation came from, and answers the accusation that the Prophet ﷺ had lost his mind.",
    ],
    reflection:
      "Every structure that looks permanent here is described being taken apart. Degrees, rankings, the graduate scheme everyone is competing for. None of it is worthless, but this surah puts it at its real size, which is a useful thing to hold when you did not get the offer.",
  },
  82: {
    paragraphs: [
      "Revealed in Makkah at around the same time as Surah At-Takwir, which it closely resembles.",
      "It describes the sky splitting, the stars scattering, the seas bursting their limits and the graves being turned over, and then makes it personal. On that day every soul will know exactly what it sent ahead and what it left behind. It asks what it was that fooled a person about his generous Lord, the One who created him, shaped him and balanced him. It also mentions the noble angels who write down what we do, so that nothing depends on anyone's memory.",
    ],
    reflection:
      "Two angels are writing, and they are not careless. That is either uncomfortable or steadying depending on the week you are having. It also means the good you did that nobody noticed, the prayer nobody saw, the help you gave quietly, was recorded properly.",
  },
  83: {
    paragraphs: [
      "Revealed early in Makkah, at a time when one surah after another was pressing the reality of the next life on people who were dismissing it.",
      "It starts with one very ordinary piece of dishonesty. Traders who insist on full measure when they are receiving, and quietly give less when they are the ones weighing it out. The surah treats that as a symptom rather than the disease. People cheat in small ways because they do not really expect to be asked about it. From there it sets out two records, one for those who lived badly and one for those who lived well, and describes the believers who were laughed at in this world sitting on couches and watching on that day.",
    ],
    reflection:
      "It starts with someone shaving a little off a measurement, which is the ancestor of a padded reference, a paraphrased essay, or a slightly generous timesheet. The surah's point is that small dishonesty grows in people who do not really expect to be asked about it. Academic integrity is not just a university rule.",
  },
  84: {
    paragraphs: [
      "Another of the earliest Makkan surahs. The Muslims were not yet being physically harmed at this point, but the message was being openly rejected.",
      "It describes the sky splitting and the earth being stretched flat and emptying out everything inside it, and gives the same reason twice: because it listened to its Lord, and that was what it had to do. Then it turns to the reader directly. You are working your way towards your Lord and you will meet Him, and your record will be handed to you either in your right hand or from behind your back. The surah closes by asking why, when all this is so plain, people still will not believe.",
    ],
    reflection:
      "You are labouring towards your Lord and you will meet Him. That reframes a degree: not the destination, but part of the walk. It also means the years that feel like they are going nowhere are still going somewhere.",
  },
  85: {
    paragraphs: [
      "Revealed in Makkah when the persecution of Muslims was at its worst and the leaders of the city were using force and torture to push new Muslims back into their old religion.",
      "It tells of an earlier people who dug a long trench, filled it with fire, and sat at the edge watching while believers were thrown in, guilty of nothing except believing in Allah. The surah speaks to both sides at once. To those doing the persecuting it gives a warning. To those enduring it, it offers something steadier: Allah saw all of it, He is the Forgiving and the Loving, and His grip is severe. This had happened before, to people who held on, and it was recorded.",
    ],
    reflection:
      "It was revealed for people being harmed for their faith, and it does not promise them rescue. It promises them that Allah saw it. If you are the only Muslim in a seminar room, or you have taken a knock for praying at an awkward time, this surah does not tell you to feel better. It tells you that you are seen.",
  },
  86: {
    paragraphs: [
      "Revealed in Makkah when the leaders of the city were trying every plan they could think of to stop the Qur'an from spreading.",
      "It swears by the star that pierces the night, and points out that there is no soul without a guardian watching over it. Then it asks a person to think about what he was originally made from, and draws the obvious conclusion: whoever could make him from that can certainly bring him back afterwards. The surah closes by saying that the Qur'an is a decisive word and not entertainment, and that while they are making their plans, Allah is planning too.",
    ],
    reflection:
      "There is no soul without a guardian over it. Living away from home for the first time can feel like nobody is watching and nothing you do matters much. This surah says both halves of that are wrong.",
  },
  87: {
    paragraphs: [
      "One of the earliest surahs revealed. One of its verses promises the Prophet ﷺ that he will be made to recite and will not forget, which suggests it came while he was still worried about holding on to what was being revealed to him.",
      "It carries three threads. First, that Allah's name should be kept high and clear of anything that suggests weakness or resemblance to created things, since wrong ideas about Allah are where most false beliefs begin. Second, an instruction to the Prophet ﷺ simply to remind, because the reminder will help whoever is willing to listen. Third, a plain comparison at the end: people prefer this life, while the next one is better and does not end. It notes that this was in the earlier scriptures too.",
    ],
    reflection:
      "Remind, because the reminder benefits whoever is willing to hear it. That is permission to stop wearing yourself out arguing. Say the thing once, clearly and kindly, and leave it. You were never responsible for making someone accept it.",
  },
  88: {
    paragraphs: [
      "Revealed early in Makkah, once the Prophet ﷺ had started preaching in public and people were hearing the message for the first time.",
      "It opens by asking whether news of the overwhelming event has reached you, then shows two faces side by side. One is exhausted and humiliated, the other is pleased with everything it worked for. Having shown both endings, the surah turns to things anybody can look at without being taught anything first. The camel and how it was made. The sky and how it was raised. The mountains and how they were fixed in place. The earth and how it was spread out. The instruction that follows is only to remind, because the Prophet ﷺ was never sent to force anyone.",
    ],
    reflection:
      "It tells the Prophet ﷺ plainly that he is not there to control anyone. If you have a friend who is drifting from the deen, that line is for you as much as him. Your job is to keep the door open, not to force them through it.",
  },
  89: {
    paragraphs: [
      "Revealed in Makkah once persecution of new Muslims had started. The three peoples it names were chosen deliberately, because each of them had real power and was confident it would last.",
      "After swearing by the dawn and the nights, it recalls the people of Ad with their towering pillars, Thamud who carved homes out of the rock in the valley, and Pharaoh with his stakes, and then says simply that your Lord is always watching. It moves on to how people behave about money: delighted when they are given plenty, resentful when they are given less, while doing nothing for the orphan and not encouraging anyone to feed the poor. It ends beautifully, with the soul at peace being called back to its Lord, pleased and pleasing.",
    ],
    reflection:
      "It describes the same person delighted when given plenty and bitter when given less, which is most of us with money. Student loans, a good part time job, a rejection from a placement: the surah suggests both the plenty and the lack are the same test wearing different clothes.",
  },
  90: {
    paragraphs: [
      "Revealed in Makkah in the period when the leaders of the city had decided to oppose the Prophet ﷺ openly.",
      "It swears by the city itself, then says something unusually honest: the human being was created into struggle, and life was never designed to be comfortable. It asks whether he really thinks nobody has power over him, and whether he thinks nobody was watching. Then it describes the steep uphill road that most people never attempt: freeing a slave, or feeding someone on a day when food is scarce, an orphan from your own relatives or a poor person with nothing at all. And it adds that the road also means being among those who believe and who keep encouraging each other towards patience and kindness.",
    ],
    reflection:
      "Created into hardship. This surah does not pretend life is meant to be smooth, which is more useful than most encouragement. The steep road it describes is unglamorous and specific: feed someone, help someone in debt, and stay among people who keep pushing each other towards patience.",
  },
  91: {
    paragraphs: [
      "Revealed in the earliest period in Makkah, when opposition to the Prophet ﷺ had become strong.",
      "Eleven oaths follow one after another, by the sun and its brightness, the moon that follows it, the day, the night, the sky, the earth, and finally the soul itself and the One who shaped it and showed it what is right and what is wrong. Every one of them leads to a single sentence: whoever keeps their soul clean has succeeded, and whoever lets it rot has failed. The story of Thamud follows as an example, a people who were shown exactly what to do and deliberately did the opposite.",
    ],
    reflection:
      "Whoever purifies the soul has succeeded. Not whoever gets the first, or the offer, or the following. The soul is described as something maintained rather than achieved, which means it responds to small daily attention and degrades quietly when ignored.",
  },
  92: {
    paragraphs: [
      "Revealed in Makkah at about the same time as Surah Ash-Shams, which it closely resembles. Each one reads like an explanation of the other.",
      "Its subject is that what people spend their lives working towards genuinely differs, as different as night is from day. One person gives, keeps Allah in mind and believes in the best reward, and his path is made smooth towards ease. Another holds back, decides he does not need anyone, and denies that reward, and his path is made smooth towards hardship. The surah ends with the person who gives his wealth away to purify himself, expecting no favour in return from anybody, wanting only the face of his Lord.",
    ],
    reflection:
      "Two people, two paths, and the difference is generosity. It ends with someone giving wealth away wanting no favour in return, seeking only his Lord's face. Worth reading before deciding whether you can spare the donation everyone in the group chat is ignoring.",
  },
  93: {
    paragraphs: [
      "Revealed in Makkah after revelation had stopped coming for a period. The Prophet ﷺ was badly distressed by the silence, and people in the city had begun saying that his Lord had abandoned him and was angry with him.",
      "The answer is personal and very gentle. By the morning light and by the night when it is still, your Lord has not left you and is not displeased with you. What is coming is better than what has passed, and He will keep giving until you are satisfied. Then it reminds him of his own life. He was an orphan and was sheltered. He was lost and was guided. He was in need and was given enough. And it turns each one into an instruction: so do not treat the orphan harshly, do not turn away the one who asks, and speak about what your Lord has given you.",
    ],
    reflection:
      "This came after a stretch when revelation stopped and the Prophet ﷺ felt abandoned. If your prayers feel flat and your imaan feels thin, this surah is closer to you than most. It does not blame him for feeling it. It tells him what is coming is better than what has gone.",
  },
  94: {
    paragraphs: [
      "Revealed in Makkah in the same period and the same conditions as Surah Ad-Duha, and it continues straight on from it. Before he began preaching, the Prophet ﷺ had been widely respected in Makkah. Afterwards the same people turned on him, which was a shock unlike anything in his life until then.",
      "The surah reminds him of what had already been done for him. His chest was opened up. The weight that had been pressing on his back was lifted off. His name was raised high. Then comes the line the surah is known for, and it is said twice rather than once: with hardship comes ease. It ends with instructions rather than comfort. When you finish one thing, start working on the next, and turn to your Lord.",
    ],
    reflection:
      "With hardship comes ease, and it is said twice. Read it during exams, during a bad diagnosis, during a term where nothing works. Note that it does not say after hardship. It says with, which is a more difficult and more useful claim.",
  },
  95: {
    paragraphs: [
      "It swears by the fig and the olive, by Mount Sinai where Musa spoke with Allah, and by this secure city, meaning Makkah. Each of these places is connected to a prophet, which ties the surah to a long line of guidance rather than a single moment.",
      "Its statement about the human being is short and heavy. He was created in the very best form, and then brought down to the lowest of the low, except those who believe and do good, who receive a reward that never runs out. It closes by asking what, after all of this, could still make a person deny that there will be a judgement, and whether Allah is not the most just of all judges.",
    ],
    reflection:
      "Created in the best of forms. In an environment that quietly ranks people by grades, looks and prospects, that is a statement about your value that has nothing to do with any of those. The fall it describes comes from what you do, not from what you achieve.",
    dispute: "Most scholars say this surah was revealed in Makkah. Some say Madinah.",
  },
  96: {
    paragraphs: [
      "The first five verses are the very first words of the Qur'an ever revealed. They came to the Prophet ﷺ in the cave of Hira, on a mountain outside Makkah, where he used to go alone to think. The rest of the surah came later, once he had begun preaching and opposition had started.",
      "It opens by telling him to read in the name of the Lord who created, who made the human being from a clinging clot, and who taught by the pen what he did not know. The very first word of the Qur'an is about reading, and the first thing mentioned after creation itself is knowledge. The later verses describe a man who saw someone praying and tried to stop him, and warn him that Allah sees what he is doing. The surah ends by telling the reader to prostrate, which is why a sajdah is made here.",
    ],
    reflection:
      "The first word revealed was read, and the first thing mentioned after creation was teaching. Your degree is not separate from your deen. Studying properly, not cutting corners, and using what you learn well is closer to worship than most students realise.",
  },
  97: {
    paragraphs: [
      "This surah comes directly after Al-Alaq, which carries the first revelation. That order is deliberate: one tells you what was revealed, and this one tells you the night it came down on.",
      "It says the Qur'an was sent down on the Night of Decree, and that this one night is worth more than a thousand months, which is more than eighty years. On it the angels come down with every matter that has been decided, and it is peace until dawn breaks. For someone memorising, the point is about the worth of what they are memorising. This is not an ordinary book and it did not arrive on an ordinary night.",
    ],
    reflection:
      "One night worth more than eighty years. It is a strong argument against measuring your life in terms of how much time you have. A short period spent properly outweighs long stretches spent badly, which should be encouraging if you feel behind.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  98: {
    paragraphs: [
      "Its position in the Qur'an is meaningful. The surahs just before it say what was revealed and when it came down, and this one explains why a messenger had to be sent along with it at all.",
      "It says that the Jews and Christians, who already had scriptures, and the idol worshippers, who did not, were never going to change until clear evidence reached them: a messenger from Allah reciting pure pages. It then states what was actually being asked of them, in a single sentence. Worship Allah sincerely, establish the prayer, and give charity. That, it says, is the upright religion. The surah ends with the reward waiting for those who believed and did good.",
    ],
    reflection:
      "It states what is actually being asked of you in one sentence: sincerity, prayer, charity. Practising Islam at university can start to feel like an enormous list you are failing at. This surah cuts it back to something you can hold in your head walking to a lecture.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  99: {
    paragraphs: [
      "A short surah about the second life and the record of what a person did with the first one.",
      "The earth is shaken with its last and greatest shaking, throws out everything buried inside it, and the human being asks what on earth is happening to it. Then the surah does something remarkable. It says the earth will report its news, because your Lord instructed it to. The ground people walked on and lived their lives on becomes the witness against them. It ends with the line almost everyone knows: whoever does the weight of an atom of good will see it, and whoever does the weight of an atom of evil will see it.",
    ],
    reflection:
      "An atom's weight of good will be seen. The greeting you gave someone sitting alone, the message you sent to someone struggling, the two minutes you spent helping. None of it evaporates. The same applies to the small things you would rather forget.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  100: {
    paragraphs: [
      "Revealed against the background of Arabia at that time, where tribes raided each other constantly and bloodshed was normal. The opening oaths describe war horses galloping, striking sparks from the stones with their hooves and raising clouds of dust at dawn. Everyone hearing it had seen exactly that.",
      "From that scene it turns on the human being. He is ungrateful to his Lord, and he knows it himself. And he loves wealth intensely. The closing verses ask whether he understands what happens when everything in the graves is scattered out and everything hidden in people's chests is brought into the open. It is not only what people did that will be examined, but what they were keeping to themselves.",
    ],
    reflection:
      "It describes someone intense in his love of wealth, and ends by saying that what is inside the chest will be brought out. Most of us manage our visible behaviour well. This surah is interested in the part nobody sees, including the resentment and the jealousy.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  101: {
    paragraphs: [
      "Everyone agrees this surah was revealed in Makkah, and its contents place it among the earliest.",
      "It names the striking calamity three times at the start, which stops the listener and makes them pay attention, then gives two pictures of that day. People scattered about like moths around a lamp, and mountains blown apart like tufts of wool. After that it becomes very simple. Deeds are weighed, and whoever's good deeds weigh heavy will live a life that pleases them. The surah is short, and its shortness is part of why it hits.",
    ],
    reflection:
      "Deeds are weighed rather than counted. That is worth knowing if you feel your practice is small: a sincere prayer offered when it was genuinely difficult may weigh more than a great deal of easy activity.",
  },
  102: {
    paragraphs: [
      "Revealed in Makkah. It names a very ordinary human problem: competing with each other over who has more.",
      "Piling up money and status, and constantly measuring yourself against other people, keeps someone occupied right up until they are in the grave. The word used means being kept busy with something small while something far bigger goes ignored, so what is being criticised is the distraction rather than owning things. The surah then repeats its warning twice for emphasis, and ends by saying that on that day you will be asked about the comforts you enjoyed.",
    ],
    reflection:
      "Competing over more, until you reach the graves. This is the surah for the group chat comparing internships, the endless scroll of other people's lives, the sense that everyone is further ahead. It does not say wanting things is wrong. It says being consumed by the comparison is.",
  },
  103: {
    paragraphs: [
      "One of the earliest surahs revealed in Makkah, and only three verses long.",
      "It swears by time itself, then states that human beings are in loss, and makes four exceptions. Those who believe. Those who do good. Those who encourage one another towards the truth. And those who encourage one another to be patient. Imam ash-Shafi'i, one of the great early scholars, said that if people thought carefully about this surah alone it would be enough to guide them. The last two conditions are worth noticing while memorising it, because neither of them is something a person can do on their own.",
    ],
    reflection:
      "The last two conditions cannot be done alone. You need people who will tell you the truth and people who will hold you steady. Choosing your friends at university is not a social decision, it is most of what determines who you are by third year.",
    dispute: "Most scholars say this surah was revealed in Makkah. A few say Madinah.",
  },
  104: {
    paragraphs: [
      "Revealed in Makkah, among the earliest. The behaviour it describes was recognised as ugly by the Arabs themselves, so nobody was going to defend it.",
      "It warns the person who runs others down behind their backs and mocks them to their faces, and who piles up money and counts it over and over as though it will keep him alive forever. The surah answers that directly: it will not. What is being condemned is a whole character, someone who uses money and words to make himself feel large by making other people small.",
    ],
    reflection:
      "Mocking people behind their backs, and money used to feel superior. Banter that has an edge to it, group chats that pick someone apart, laughing at somebody who is trying. This surah puts that in the same category as hoarding wealth, which is harsher than most of us would.",
  },
  105: {
    paragraphs: [
      "This surah recalls something that happened in the year the Prophet ﷺ was born, decades before he received revelation. Abraha, the Abyssinian governor ruling Yemen, marched an army north to destroy the Kabah in Makkah, and brought an elephant with him, an animal the Arabs had barely seen. Makkah had no army capable of stopping him.",
      "Five short verses were enough, because everyone hearing them already knew the story. It asks whether you have not considered what your Lord did with the companions of the elephant, and answers that He turned their plan to nothing and sent flocks of birds against them, leaving them like chewed straw. The people of Makkah themselves believed the Kabah had been saved by Allah and not by any of their idols, which is exactly the point the surah rests on.",
    ],
    reflection:
      "A power everyone assumed was unstoppable was stopped without a battle. Whatever is currently frightening you, an exam board, a visa, a diagnosis, a family situation, it is not larger than what dealt with the army of the elephant.",
  },
  106: {
    paragraphs: [
      "This follows straight on from Surah Al-Fil and reads as its conclusion. Quraysh were the tribe who controlled Makkah and looked after the Kabah, and the Prophet ﷺ came from among them.",
      "It reminds them of the security they already enjoyed. Because of the Kabah's standing, their trading caravans could travel south to Yemen in winter and north to Syria in summer without being attacked, which was not true for anyone else. Then it makes an argument they could not easily answer. You already accept that this House belongs to Allah rather than to the idols, and you know who fed you when you would otherwise have gone hungry and kept you safe when you would otherwise have been afraid. So worship Him.",
    ],
    reflection:
      "It asks them to notice the safety and provision they had stopped noticing. Reliable food, a bed, a place to study, being able to pray without being arrested. Most students in your position have more of this than they register, and the surah's response to it is worship rather than guilt.",
    dispute: "Most scholars say this surah was revealed in Makkah. A few say Madinah.",
  },
  107: {
    paragraphs: [
      "Revealed in Makkah. Its subject is what a person turns into when the next life means nothing to them.",
      "It asks who it is that really denies the Judgement, and the answer is not somebody who argues about it in public. It is the person who shoves an orphan aside and cannot be bothered to encourage anyone to feed the poor. The last four verses turn to a second group: people who do pray, but whose minds are somewhere else while they pray, who only pray when someone is watching, and who will not lend out even the smallest everyday things. The surah measures both groups by how they treat other people.",
    ],
    reflection:
      "Someone who prays but is heedless of the prayer, and who will not lend out the smallest thing. It is a warning aimed at practising people, not at those who do not pray at all. It is possible to keep every prayer and still be someone others find unhelpful and cold.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  108: {
    paragraphs: [
      "The shortest surah in the Qur'an, three verses. Anas ibn Malik related that the Prophet ﷺ was sitting among them when he dozed for a moment, then lifted his head smiling. He told them a surah had just been revealed, recited it, and asked whether they knew what al-Kawthar was. When they said Allah and His Messenger know best, he told them it is a river his Lord has given him in Paradise.",
      "It was revealed while the Prophet ﷺ was being taunted with the word abtar, meaning cut off. His sons had died in childhood, and in that society a man with no son to carry his name was considered finished, someone who would be forgotten as soon as he died. The reply is that he has been given abundance, and that the one throwing the insult is the one who will be cut off. Between the two comes an instruction: so pray to your Lord, and sacrifice.",
    ],
    reflection:
      "He was mocked for having nothing to leave behind. If you have been made to feel small, passed over, or treated as though you do not matter, the reply here is not to fight back. It is to go and pray, and to trust that abundance was already given.",
    dispute: "Most scholars say this surah was revealed in Makkah. Some say Madinah.",
  },
  109: {
    paragraphs: [
      "Revealed in Makkah when the leaders of the city offered the Prophet ﷺ a deal. He would worship their gods for a period, and they would worship his for a period, so that the argument splitting the city could be settled without either side losing face.",
      "The surah turns that down completely, and does it without insults. It separates the two things entirely, saying that what you worship and what I worship are not the same thing and never will be, and then ends without any further argument: for you your religion, and for me mine. It is not a statement that all beliefs are equally true. It is a refusal to blend two things that cannot be blended.",
    ],
    reflection:
      "It draws a hard line without a raised voice. That is a difficult combination for a student who does not want to seem hostile but also does not want to be dragged along. You can decline the night out, or the drink, without a speech and without apologising for it.",
    dispute: "Most scholars say this surah was revealed in Makkah. Some say Madinah.",
  },
  110: {
    paragraphs: [
      "To understand this surah you need what came before it. The Prophet ﷺ preached in Makkah for thirteen years and was driven out, and the Muslims migrated north to Madinah, where they built a community from nothing. Makkah did not leave them alone, and years of conflict followed. Eventually a treaty was signed, and when the Makkans broke it, the Prophet ﷺ returned with an army so large that the city surrendered without a battle. He entered the place that had expelled him, cleared the idols from the Kabah, and forgave the people who had fought him for twenty years. After that, tribes across Arabia began accepting Islam in large numbers.",
      "This surah was revealed near the end of his life, and it is understood to be the last complete surah revealed. It tells him that when the help of Allah and the victory come, and he sees people entering the religion in crowds, the work he was sent to do has been finished. And then, at the very moment of success, it asks for something unexpected. Not celebration. Praise your Lord, and ask His forgiveness.",
    ],
    reflection:
      "At the moment of complete success he was told to seek forgiveness. Not celebrate. When the results come out well, when you get the offer, when the thing you prayed for lands, the surah suggests an unusual response: gratitude, and asking what you missed along the way.",
  },
  111: {
    paragraphs: [
      "This surah concerns Abu Lahab, the Prophet's ﷺ own uncle, who opposed him more persistently than almost anyone else in Makkah. At one point the leading families of the city cut off the Prophet ﷺ and his whole clan, refusing to trade with them or marry into them, and forcing them into a valley outside the city for around three years. Abu Lahab was the only member of the family who sided with the boycotters against his own relatives.",
      "The surah is unusual because it names a living opponent and states how he will end while he was still alive and free to prove it wrong, which he never did. His wife is mentioned as the carrier of firewood, understood both literally, since she put thorns in the Prophet's ﷺ path, and as a picture of someone who carries gossip between people. The lesson underneath it is that being closely related to the Prophet ﷺ counted for nothing without belief, and neither his wealth nor his standing was going to help him.",
    ],
    reflection:
      "Being closely related to the Prophet ﷺ did not save Abu Lahab. Coming from a practising family, having memorised a lot, being known as religious, none of it carries anyone by itself. What you actually do is what belongs to you.",
  },
  112: {
    paragraphs: [
      "The people of Makkah came to the Prophet ﷺ and said: tell us the ancestry of your Lord. It was a reasonable question in their world. The gods they worshipped were carved from wood and stone or cast in gold and silver, they had bodies, they were descended from one another, they had wives and children, and they needed feeding. Asking who this new God was descended from was simply how you found out about a god.",
      "The four verses answer by ruling every part of that out. He is Allah, One. He is as-Samad, the One that everything depends on and who depends on nothing at all. He did not father anyone and was not fathered by anyone. And there is nothing whatsoever like Him. The Prophet ﷺ said this surah is equal to a third of the Qur'an, and it is one of the first surahs almost every Muslim learns.",
    ],
    reflection:
      "Someone will eventually ask you what Muslims actually believe about God, probably over coffee and probably without warning. This surah is the answer, and it is four verses long. Knowing it properly is worth more than a long defensive explanation.",
    dispute: "Scholars differ over whether this surah was revealed in Makkah or Madinah.",
  },
  113: {
    paragraphs: [
      "Revealed in Makkah, in the period when opposition to the Prophet ﷺ had become intense and was coming at him from several directions at once.",
      "It is a prayer asking Allah for protection, addressing Him as the Lord of the daybreak, the One who splits the darkness open every morning. It asks for shelter from the harm in everything He created, from the dark when night settles in, from those who try to harm others through magic, and from a jealous person when his jealousy takes hold. Together with the surah after it, these two are known as the Muawwidhatayn, the two surahs of seeking refuge. They were revealed together and are normally recited together.",
    ],
    reflection:
      "It teaches you to ask for protection from harm coming at you, including envy, which is real and is rarely discussed. It is also a reminder that reaching for a prayer is a legitimate first response to feeling unsafe, not a last resort after everything else.",
    dispute: "Most scholars say these two surahs were revealed in Makkah. Some say Madinah.",
  },
  114: {
    paragraphs: [
      "Revealed in Makkah alongside Surah Al-Falaq, in the same circumstances and as one pair with it.",
      "Where Al-Falaq asks for protection from harm coming at you from outside, this one asks for protection from harm that starts inside you: the whisperer who slips away when Allah is remembered and comes back when He is forgotten, putting thoughts into people's chests. It calls on Allah using three titles in a row, Lord of mankind, King of mankind, God of mankind, so that whoever is praying knows exactly who they are asking and on what basis they are asking Him.",
    ],
    reflection:
      "The whisper that comes and goes, that slips in when you stop remembering Allah and disappears when you start again. Anxiety, doubt at 2am, the voice that tells you it is too late for you. This surah names it accurately and gives you exactly what to say back.",
    dispute: "Most scholars say these two surahs were revealed in Makkah. Some say Madinah.",
  },
};
