/**
 * Short summaries of each surah in the memorisation run, written for
 * beginners.
 *
 * WHERE THE CONTENT COMES FROM. The substance is drawn from Sayyid Abul A'la
 * Maududi's Tafhim al-Qur'an (via the Quran.com API, kept in
 * surah-detail.json): the occasion of revelation, the period, the theme, and
 * the narrations Tafhim cites. The wording is not his. Tafhim is a scholarly
 * commentary written for readers with grounding, and quoting it directly
 * produced paragraphs of dispute between commentators that this programme's
 * students have no use for.
 *
 * WHAT THEY ARE FOR. A student memorising a surah should know what they are
 * memorising: when it came, what prompted it, and what it is saying. Where a
 * narration records the actual question that was asked, it is quoted, because
 * "someone asked about God's ancestry and this was the answer" teaches more
 * than "it is about God's oneness".
 *
 * HOUSE STYLE. No em dashes. Commas, semicolons and full stops instead.
 *
 * REVIEW STATUS. `REVIEWED` is false. These were drafted by an assistant
 * working from Tafhim, not written by a scholar, and the page marks every one
 * of them as a draft until that changes. Someone qualified at BSMS should read
 * all 43 and then flip the flag. Pay particular attention to the narrations:
 * they are reported here at second hand.
 *
 * `revealedIn` is NOT restated here; it comes from surah-info.ts, so the two
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
      "Revealed in Makkah. Bukhari and Muslim record, on the authority of Ibn Abbas, that the Prophet صلى الله عليه وسلم was travelling with some companions towards the fair of Ukaz and stopped at a place called Nakhlah to lead the dawn prayer. A group of jinn passing by heard the Qur'an being recited, stayed to listen, and went back to their people to tell them what they had heard.",
      "Most of the surah is their own words, quoted back to us. They say they heard a wonderful recitation guiding to right conduct, that they believed in it, and that they will never associate anyone with their Lord. They also correct beliefs their own people had held for generations. Nobody argued them into it and no messenger had been sent to them; hearing it was enough.",
    ],
  },
  73: {
    paragraphs: [
      "The first nineteen verses were revealed at Makkah, very early. The Prophet صلى الله عليه وسلم is addressed by how he was at that moment, wrapped in his cloak, and told to stand in prayer for about half the night. The closing verse came years later in Madinah and eased that requirement, since Allah knew the community could not sustain it.",
      "The opening verses explain why the night was needed: a weighty word was about to be placed on him, and the night is when impressions are strongest and speech is most upright. Alongside prayer he is told to recite unhurriedly, to be patient with what people say, and to leave those who deny him to Allah. It is a surah about preparation rather than about the mission itself.",
    ],
  },
  74: {
    paragraphs: [
      "Among the earliest revelations at Makkah. Bukhari, Muslim and others record from Jabir ibn Abdullah that after the first five verses of Al-Alaq revelation paused. When it resumed, the Prophet صلى الله عليه وسلم saw the angel who had come to him at Hira, returned home shaken and asked to be covered, and these verses came.",
      "This is where the public call begins, and the instructions are short and practical: rise, warn, magnify your Lord, keep your clothes clean, and do not give in order to receive more back. The later part describes a man who listened to the Qur'an, thought about it, and then called it magic passed down, because admitting the truth would have cost him his standing.",
    ],
  },
  75: {
    paragraphs: [
      "One of the earliest surahs revealed at Makkah, when the idea of being raised after death was being openly mocked. The objection people raised was practical: how could scattered bones ever be gathered again?",
      "The surah answers it directly. Allah is able not only to reassemble the bones but to restore even the fingertips, which are different in every person. In the middle the Prophet صلى الله عليه وسلم is told not to move his tongue in haste trying to hold on to the revelation, because gathering it and making it clear was Allah's responsibility, not his. It ends with the moment the soul reaches the collarbone.",
    ],
  },
  76: {
    paragraphs: [
      "The surah opens with the human being before he was anything at all: a period when he was not a thing worth mentioning, then a mixed drop, then given hearing and sight. Having been shown the way, he is either grateful or ungrateful, and the choice is genuinely his.",
      "Most of what follows describes those who fulfil their vows and fear a day whose evil is widespread, and who feed the poor, the orphan and the captive despite loving the food themselves, saying: we feed you only for the sake of Allah, we want no reward from you and no thanks. The descriptions of the Garden that follow are long and unhurried, and they are the substance of the surah rather than an appendix to it.",
    ],
    dispute: "Scholars differ on where it was revealed. Most commentators cited in Tafhim hold it Makkan; it is also reported as Madinan.",
  },
  77: {
    paragraphs: [
      "Revealed in the earliest period at Makkah, in the same run as Al-Qiyamah, Ad-Dahr, An-Naba and An-Naziat, all of which press the same subject.",
      "It opens with an oath by the winds sent forth and argues from them: the One who arranged this system in the world is not unable to bring about another. A single line returns after each stage of the argument, woe that day to those who denied, ten times in all. That refrain is what makes the surah memorable, and it is why it reads as a series of warnings rather than a lecture.",
    ],
  },
  78: {
    paragraphs: [
      "Revealed early at Makkah, in the period when the Prophet's صلى الله عليه وسلم message rested on three claims: that nobody shares in Allah's divinity, that he had been sent as a messenger, and that this world will end and another will follow. People were arguing about the third.",
      "The surah opens by asking what they are questioning one another about, then answers with a list of ordinary things: the earth spread out as a bed, mountains set as pegs, night as a covering, sleep as rest, and the sun as a blazing lamp. The case it makes is simple. Whoever arranged all this can certainly raise you again. It ends with a person on that day wishing he had sent something ahead.",
    ],
  },
  79: {
    paragraphs: [
      "Ibn Abbas reported that this surah came down after An-Naba. It belongs to the same early Makkan period and continues the same argument.",
      "It swears by the angels who pull out souls at death and who carry out Allah's commands, and the argument sits inside the oath: those who can draw a soul out today can return it tomorrow. The middle of the surah tells of Musa being sent to Pharaoh, who was shown the greatest sign and answered by gathering his people and claiming to be their highest lord. The end says the knowledge of when the Hour comes belongs to Allah alone.",
    ],
  },
  80: {
    paragraphs: [
      "The commentators are unanimous about the occasion. Some of the chiefs of Makkah were sitting with the Prophet صلى الله عليه وسلم while he was earnestly trying to persuade them to accept Islam. A blind man named Ibn Umm Maktum, an early convert, came and interrupted with a question about Islam, and the Prophet صلى الله عليه وسلم disliked the interruption and ignored him.",
      "The surah opens by correcting that, then widens out. Read whole, the displeasure falls on the chiefs: men who were being given time and attention while rejecting the truth out of arrogance, when the one genuinely seeking it was the one waved aside. Ibn Umm Maktum went on to be honoured by the Prophet صلى الله عليه وسلم, who is reported to have greeted him afterwards by saying: welcome to the one on whose account my Lord admonished me.",
    ],
  },
  81: {
    paragraphs: [
      "One of the earliest surahs revealed at Makkah. Ibn Umar reported that the Prophet صلى الله عليه وسلم said that whoever wishes to see the Day of Resurrection as though with his own eyes should read At-Takwir, Al-Infitar and Al-Inshiqaq.",
      "The first verses take the world apart: the sun folded up, the stars falling, the mountains moved, the pregnant camels left untended, the seas set boiling. Among them is a question the Arabs of the time understood immediately, about the infant girl buried alive being asked for what sin she was killed. The second half turns to the source of the revelation, describing the one who brought it and stating that the Prophet صلى الله عليه وسلم is not mad, as they were saying.",
    ],
  },
  82: {
    paragraphs: [
      "Revealed at Makkah in the same period as At-Takwir, which it closely resembles in subject and style.",
      "It describes the sky splitting, the stars scattering, the seas bursting forth and the graves overturned, then makes it personal: on that day every soul will know what it sent ahead and what it held back. It asks what deceived a person about his generous Lord, who created him, proportioned him and balanced him. It also names the honourable scribes who record what we do, so that nothing is left to memory.",
    ],
  },
  83: {
    paragraphs: [
      "Revealed early at Makkah, in the period when surah after surah was pressing the reality of the Hereafter on people who dismissed it.",
      "It opens with one everyday dishonesty: those who take full measure when receiving from others, and give less when they measure or weigh for them. The surah treats that as a symptom. People cheat in small ways because they do not really expect to be asked about it. From there it sets out two records, one for the wicked and one for the righteous, and describes the believers who were laughed at in this world watching from couches on that day.",
    ],
  },
  84: {
    paragraphs: [
      "Among the earliest Makkan surahs. Persecution of the Muslims had not yet begun, but the Qur'an was being openly rejected in Makkah.",
      "It describes the sky splitting and the earth being stretched out and emptying what is inside it, and gives the reason twice: because it listened to its Lord, and it was right to do so. Then it turns to the reader. You are labouring towards your Lord and will meet Him, and your record will be given either in your right hand or from behind your back. It asks why, when the signs are this plain, people still do not believe.",
    ],
  },
  85: {
    paragraphs: [
      "Revealed at Makkah when persecution of the Muslims was at its height, and the Quraysh were using force to turn new converts back from Islam.",
      "It recalls the people of the ditch, who dug a trench, filled it with fire, and sat watching while believers were thrown in, guilty of nothing except believing in Allah. The surah speaks to both sides at once. It warns those doing the persecuting that they will face the punishment of burning, and it reassures those enduring it that Allah is watching, that He is the Forgiving and the Loving, and that His grip is severe. It closes by pointing out that the Qur'an itself is preserved on a guarded tablet.",
    ],
  },
  86: {
    paragraphs: [
      "Revealed at Makkah in the period when the Quraysh were trying every plan they could devise to stop the Qur'an spreading.",
      "It swears by the night visitor, the piercing star, and observes that there is no soul without a guardian over it. Then it asks a person to consider what he was created from, a fluid ejected, and draws the conclusion: the One who made him from that is able to return him. The surah closes by saying the Qur'an is a decisive word and not amusement, and that while they are making their plans, Allah is planning too.",
    ],
  },
  87: {
    paragraphs: [
      "One of the earliest surahs revealed. The words in verse six, that he would be made to recite and would not forget, indicate that it came while the Prophet صلى الله عليه وسلم was still anxious about retaining what was revealed to him.",
      "It carries three strands. Glorify the name of your Lord, the Most High, and keep it clear of anything that suggests deficiency or resemblance to created things. Then instructions to the Prophet صلى الله عليه وسلم, that he should remind, since the reminder benefits whoever is willing to hear it. Then a plain comparison: people prefer this life, while the next is better and lasting. It notes that this was in the earlier scriptures too, of Ibrahim and Musa.",
    ],
  },
  88: {
    paragraphs: [
      "Revealed early at Makkah, once the Prophet صلى الله عليه وسلم had begun preaching publicly and people were hearing the message for the first time. At that stage his preaching centred on two things the Quraysh rejected: Allah's oneness, and the Hereafter.",
      "It opens by asking whether news of the overwhelming event has reached you, then shows two faces: one humbled and exhausted, and one pleased with its effort. Having pictured both, it turns to things anyone can look at without instruction, the camel and how it was made, the sky and how it was raised, the mountains and how they were fixed, the earth and how it was spread. The instruction that follows is only to remind, since the Prophet صلى الله عليه وسلم was not sent to control people.",
    ],
  },
  89: {
    paragraphs: [
      "Revealed at Makkah when persecution of new Muslims had begun. The three peoples it names were held up to the Quraysh deliberately, since all of them had strength and were confident in it.",
      "After oaths by the dawn, the ten nights, the even and the odd, it recalls Ad of the lofty pillars, Thamud who carved the rocks in the valley, and Pharaoh of the stakes, and says plainly that your Lord is ever watchful. It then turns to how people behave with money: pleased when given plenty, resentful when restricted, while not honouring the orphan or urging one another to feed the poor. It ends with the soul at rest being called back, well pleased and pleasing.",
    ],
  },
  90: {
    paragraphs: [
      "Revealed at Makkah in the period when the Quraysh had resolved to oppose the Prophet صلى الله عليه وسلم openly.",
      "It swears by the city, then states something honest: the human being was created into hardship, and life was never designed to be comfortable. It asks whether he thinks nobody has power over him, and whether he thinks nobody saw him. Then it names the steep path that most people do not attempt: freeing a slave, or feeding on a day of severe hunger an orphan near of kin or a poor person in the dust. It adds that this also means being among those who believe and urge one another to patience and to compassion.",
    ],
  },
  91: {
    paragraphs: [
      "Revealed in the earliest period at Makkah, at a stage when opposition to the Prophet صلى الله عليه وسلم had grown strong.",
      "Eleven oaths run one after another, by the sun and its brightness, the moon that follows it, the day, the night, the sky, the earth, and finally the soul and the One who proportioned it and showed it what is wrong and what is right. Every one of them leads to a single sentence: whoever purifies the soul has succeeded, and whoever corrupts it has failed. The story of Thamud follows, a people who were shown exactly what to do and did the opposite.",
    ],
  },
  92: {
    paragraphs: [
      "Revealed at Makkah around the same time as Ash-Shams, which it closely resembles. Each surah reads as an explanation of the other.",
      "Its subject is that what people are striving for genuinely differs, as different as night from day. One gives, is conscious of Allah, and believes in the best reward, and his way is made easy towards ease. Another withholds, considers himself self-sufficient, and denies the best, and his way is made easy towards hardship. It ends with the one who gives his wealth to purify himself, seeking nothing in return and no favour owed, seeking only the face of his Lord, and who will be satisfied.",
    ],
  },
  93: {
    paragraphs: [
      "Revealed at Makkah after revelation had stopped for a period. The Prophet صلى الله عليه وسلم was deeply distressed by the silence, and people had begun saying that his Lord had left him and was displeased with him.",
      "The answer is personal and gentle. By the morning brightness and by the night when it is still, your Lord has not forsaken you, nor is He displeased. What comes after is better than what came before, and He will give until you are satisfied. It then reminds him of his own life, an orphan given shelter, one lost given guidance, one in need given enough, and turns each into an instruction: so do not oppress the orphan, do not repel the one who asks, and speak of the favour of your Lord.",
    ],
  },
  94: {
    paragraphs: [
      "Revealed at Makkah in the same period and circumstances as Ad-Duha, and it continues directly from it. Before his call the Prophet صلى الله عليه وسلم had been honoured in Makkah; afterwards the same society turned hostile, and this was a shock without precedent in his life.",
      "It reminds him of what had already been done: his chest expanded, the burden that weighed on his back removed, his mention raised high. Then comes the line the surah is known for, and it is said twice rather than once, that with hardship comes ease. It ends with instructions rather than comfort: when you have finished, work on, and turn to your Lord with longing.",
    ],
  },
  95: {
    paragraphs: [
      "Held by most scholars to be Makkan. It swears by the fig and the olive, by Mount Sinai, and by this secure city, places associated with earlier prophets and with Makkah itself.",
      "Its statement about the human being is short and heavy: created in the best of forms, then reduced to the lowest of the low, except those who believe and do righteous deeds, for whom there is a reward uninterrupted. It closes by asking what then makes you deny the Judgement, and whether Allah is not the most just of judges.",
    ],
    dispute: "Most scholars hold it Makkan. Qatadah is reported as saying it is Madinan, and both views are reported from Ibn Abbas.",
  },
  96: {
    paragraphs: [
      "The first five verses are the very first revelation, received in the cave of Hira. A great majority of scholars agree on this. The rest of the surah came later at Makkah, when opposition had begun.",
      "It opens with a command to read in the name of the Lord who created, who created the human being from a clinging clot, and who taught by the pen what he did not know. The first word of the Qur'an is about reading, and the first thing mentioned after creation is knowledge. The later verses describe a man who saw someone praying and tried to prevent him, and warn him that Allah sees. The surah ends with an instruction to prostrate and draw near, which is why a sajdah is made at this point.",
    ],
  },
  97: {
    paragraphs: [
      "Its placement directly after Al-Alaq is meaningful. That surah carries the first revelation; this one names the night on which it came down.",
      "It says the Qur'an was sent down on the Night of Decree, and that this night is better than a thousand months. The angels and the Spirit descend on it by their Lord's permission with every decreed matter, and it is peace until the emergence of dawn. For a student memorising, the point is about the worth of what is being memorised. This is not an ordinary book, and it did not arrive on an ordinary night.",
    ],
    dispute: "Whether it is Makkan or Madinan is disputed. Abu Hayyan reports that most scholars regard it as Madinan.",
  },
  98: {
    paragraphs: [
      "Its position after Al-Alaq and Al-Qadr is deliberate. Those tell what was revealed and when; this one explains why a messenger had to be sent alongside it.",
      "It says that the People of the Book and the idolaters were not going to be left as they were until clear evidence came to them, a messenger from Allah reciting purified pages. It then states what was actually asked of them, in one sentence: to worship Allah sincerely, to establish prayer, and to give zakat, and says this is the upright religion. It ends with the best of creation and their reward with their Lord, gardens beneath which rivers flow.",
    ],
    dispute: "Where it was revealed is disputed. Commentators are reported on both sides, some saying most hold it Makkan and others that most hold it Madinan.",
  },
  99: {
    paragraphs: [
      "A short surah about the second life and the record of what a person did. Ibn Masud, Ata, Jabir and Mujahid are reported as holding it Makkan; Qatadah and others as Madinan.",
      "The earth is shaken with its final shaking, throws out its burdens, and the human being asks what is wrong with it. Then the surah does something remarkable. It says the earth will report its news, because your Lord inspired it to. The ground people walked on becomes the witness. It ends with the line almost everyone knows, that whoever does an atom's weight of good will see it, and whoever does an atom's weight of evil will see it.",
    ],
    dispute: "Whether it is Makkan or Madinan is disputed, with early authorities reported on both sides.",
  },
  100: {
    paragraphs: [
      "Revealed against the background of Arabia at the time, where raiding between tribes was constant and bloodshed was ordinary. The opening oaths, of galloping horses striking sparks with their hooves and raising dust at dawn, described something everyone had seen.",
      "From that it turns on the human being: he is ungrateful to his Lord, and he is himself a witness to that, and he is intense in his love of wealth. The closing verses ask whether he knows what happens when what is in the graves is scattered and what is in the breasts is brought out. Not only what people did, but what they kept hidden inside them, is included in the reckoning.",
    ],
    dispute: "Whether it is Makkan or Madinan is disputed. Ibn Masud, Jabir, Hasan al-Basri, Ikrimah and Ata are reported as saying Makkan; Anas ibn Malik and Qatadah as saying Madinan.",
  },
  101: {
    paragraphs: [
      "There is no dispute that this is Makkan, and its contents place it among the earliest revealed.",
      "It names the striking calamity three times over at the start, so that the listener stops and pays attention, then gives two pictures: people like scattered moths, and mountains like carded wool. After that it becomes very plain. Deeds are weighed, and whoever's scales are heavy will be in a pleasant life, while whoever's are light will have an abyss for a home. The surah is short, and the shortness is part of how it lands.",
    ],
  },
  102: {
    paragraphs: [
      "Makkan according to the commentators. It names a very ordinary human problem: competing over who has more.",
      "Piling up wealth and status and comparing yourself with others distracts people until they visit the graves. The word used means being kept busy with something small while something larger goes unattended, so what is being criticised is the distraction rather than owning things. It then repeats a warning twice for emphasis, saying you will come to know, and ends by saying that on that day you will be asked about the pleasures you enjoyed.",
    ],
  },
  103: {
    paragraphs: [
      "Held by a great majority of commentators to be Makkan, and among the earliest revealed. It is three verses long.",
      "Swearing by time, it states that the human being is in loss, then makes four exceptions: those who believe, who do righteous deeds, who counsel one another to truth, and who counsel one another to patience. Imam ash-Shafi'i said that if people considered only this surah it would be enough for their guidance. The last two conditions are worth noticing when memorising it, because neither of them is something a person can do alone.",
    ],
    dispute: "Mujahid, Qatadah and Muqatil are reported as holding it Madinan; a great majority of commentators hold it Makkan.",
  },
  104: {
    paragraphs: [
      "All commentators agree it is Makkan, and its subject and style place it among the earliest. The faults it names were recognised as faults by the Arabs themselves; nobody was defending them.",
      "It warns the one who slanders and belittles people, and who gathers wealth and counts it over, as though his wealth would make him live forever. The surah answers that directly: it will not. What is being condemned is a whole character, someone who uses money and words to make himself large by making other people small.",
    ],
  },
  105: {
    paragraphs: [
      "Unanimously Makkan and revealed very early. It recalls the expedition of Abraha, the Abyssinian governor of Yemen, who marched on Makkah with an elephant intending to destroy the Kabah. This happened in the year the Prophet صلى الله عليه وسلم was born.",
      "Five short verses were enough because everyone in Makkah knew the story, and the Quraysh themselves believed the Kabah had been protected by Allah rather than by any idol. The surah simply asks whether you have not considered how your Lord dealt with the companions of the elephant, and answers that He made their plan go astray and sent birds against them, leaving them like eaten straw. The ones who thought themselves unstoppable were undone without a battle.",
    ],
  },
  106: {
    paragraphs: [
      "Makkan according to a great majority of commentators, and the phrase Lord of this House points plainly to Makkah. It follows directly from Al-Fil and reads as its conclusion.",
      "It reminds the Quraysh of the security and standing they already enjoyed, which allowed their trading caravans to travel in winter to Yemen and in summer to Syria without being touched. Then it makes an argument they could not easily refuse: you already accept that this House belongs to Allah and not to the idols, and you know who fed you against hunger and made you safe from fear, so worship Him.",
    ],
    dispute: "Dahhak and Kalbi are reported as holding it Madinan; a great majority hold it Makkan.",
  },
  107: {
    paragraphs: [
      "Revealed at Makkah. Its subject is what a person becomes when the Hereafter means nothing to them.",
      "It asks who it is that denies the Judgement, and the answer is not someone who argues about it but someone who drives away the orphan and does not encourage feeding the poor. The last four verses turn to people who do pray but are heedless of their prayer, who are only seen to be praying, and who withhold small everyday kindnesses. The two halves describe open deniers and outward believers, and the surah measures both by how they treat other people.",
    ],
    dispute: "Reported as both Makkan and Madinan by early authorities.",
  },
  108: {
    paragraphs: [
      "The shortest surah in the Qur'an, three verses. Anas ibn Malik related that the Prophet صلى الله عليه وسلم was among them when he dozed briefly, then raised his head smiling. He told them a surah had just been revealed, recited it, and then asked whether they knew what al-Kawthar was. When they said Allah and His Messenger know best, he said: it is a river my Lord has granted me in Paradise.",
      "It was revealed when the Prophet صلى الله عليه وسلم was being taunted as abtar, cut off, meaning a man with no son to carry his name, so that he would be forgotten after his death. The reply is that he has been given abundance, and that it is the one taunting him who is cut off. Between the two comes an instruction: so pray to your Lord, and sacrifice.",
    ],
    dispute: "The majority hold it Makkan. Hasan al-Basri, Ikrimah, Mujahid and Qatadah are reported as holding it Madinan, on the basis of the narration from Anas.",
  },
  109: {
    paragraphs: [
      "Revealed at Makkah when the Quraysh proposed a compromise, that each side worship the other's gods for a period, so the dispute could be settled without either giving way.",
      "The surah refuses it, clearly and without insult. It separates the two things completely, saying that what you worship and what I worship are not the same and never will be, and ends without argument: for you your religion, and for me mine. Tafhim notes that this is not a statement about tolerating other religions but about not mixing them, since belief and disbelief cannot be combined into one thing.",
    ],
    dispute: "Most commentators hold it Makkan. Abdullah ibn az-Zubayr is reported as saying Madinan, and both views are reported from Ibn Abbas and Qatadah.",
  },
  110: {
    paragraphs: [
      "Ibn Abbas stated that this is the last complete surah of the Qur'an to be revealed. It came near the end of the Prophet's صلى الله عليه وسلم life, after Makkah had been opened and people were entering Islam in large numbers.",
      "It tells him that when the help of Allah and the victory come, and he sees people entering the religion in crowds, the work he was sent for has been completed. Then, at the moment of success, it commands something unexpected. Not celebration, but glorifying your Lord with praise and asking His forgiveness, and a reminder that He is ever accepting of repentance. Ibn Abbas understood it as an announcement of the Prophet's صلى الله عليه وسلم approaching death.",
    ],
  },
  111: {
    paragraphs: [
      "Makkan. It concerns Abu Lahab, the Prophet's صلى الله عليه وسلم own uncle, whose hostility had become an obstruction to the message. Tafhim suggests it may belong to the period of the boycott, when the Quraysh besieged the Prophet صلى الله عليه وسلم and his clan in the valley of Abu Talib, and Abu Lahab was the only member of the family to side with the enemies against his own relatives.",
      "The surah is unusual in naming a living opponent and stating his end while he was alive and able to disprove it, which he never did. His wife is mentioned as the carrier of firewood, a description understood both literally, of thorns placed in the Prophet's صلى الله عليه وسلم path, and as an image of carrying slander. Read beside the surahs around it, the point is that closeness of blood was worth nothing without belief, and neither his wealth nor what he earned would help him.",
    ],
  },
  112: {
    paragraphs: [
      "Several narrations give the occasion. Ibn Masud reported that the Quraysh said to the Prophet صلى الله عليه وسلم: tell us the ancestry of your Lord. Ubayy ibn Kab reported the same request from the polytheists, and Jabir ibn Abdullah reported a bedouin asking it. The question made sense in a world where gods were made of wood, stone, gold and silver, had bodies, were descended from one another, and had wives and children.",
      "The four verses answer it by ruling all of that out. He is Allah, One. He is as-Samad, the One everything depends on and who depends on nothing. He did not father anyone and was not fathered. And there is nothing at all equal to Him. The Prophet صلى الله عليه وسلم described this surah as equal to a third of the Qur'an, and it is among the first surahs almost every Muslim learns.",
    ],
    dispute: "Whether it is Makkan or Madinan is disputed, because the narrations about its occasion place it in both settings.",
  },
  113: {
    paragraphs: [
      "Revealed at Makkah, in the period when opposition to the Prophet صلى الله عليه وسلم had become intense and hostility was coming at him from several directions at once. Hasan al-Basri, Ikrimah, Ata and Jabir ibn Zayd held both this surah and the next to be Makkan.",
      "It is a prayer for refuge with the Lord of the daybreak: from the evil of what He created, from the evil of darkness when it settles, from those who blow on knots, and from the evil of an envier when he envies. With An-Nas it forms the pair known as al-Muawwidhatayn, the two surahs of seeking refuge, and they were revealed together and are recited together.",
    ],
    dispute: "Most report the pair as Makkan; a narration from Ibn Abbas reports them as Madinan.",
  },
  114: {
    paragraphs: [
      "Revealed at Makkah alongside Al-Falaq, under the same conditions and as part of the same pair. The two are almost always recited one after the other.",
      "Where Al-Falaq seeks refuge from harm arriving from outside, this seeks refuge from harm that starts inside, from the whisperer who withdraws when Allah is remembered and returns when He is forgotten, and who whispers into the chests of people. It calls on Allah by three titles in sequence, Lord of mankind, King of mankind, God of mankind, so that whoever is asking knows exactly who they are asking and by what right.",
    ],
    dispute: "Most report the pair as Makkan; a narration from Ibn Abbas reports them as Madinan.",
  },
};
