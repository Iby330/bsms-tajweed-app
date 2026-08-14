/**
 * Short, plain-language summaries of each surah in the memorisation run.
 *
 * WHY THESE EXIST. The only English surah introduction the Quran.com API
 * carries is Maududi's Tafhim al-Qur'an — a scholarly commentary written for
 * readers who already have grounding. Trimming it produced openings that
 * trailed into missing lists or referred to context that had been cut. This
 * programme's students are mostly beginners, so the summaries are written for
 * them instead: two or three sentences, no tafsir, no scholarly dispute
 * beyond a note where the difference is well known.
 *
 * REVIEW STATUS. `REVIEWED` is false. These are drafts written by an
 * assistant, not by a scholar, and the UI marks them as such until someone
 * qualified at BSMS has read them. Flip the flag once that has happened —
 * students are memorising Qur'an, and what they read alongside it should be
 * checked by a person.
 *
 * `revealedIn` deliberately is NOT repeated here; it comes from the API data
 * in surah-info.ts so the two can never disagree. `dispute` is only set where
 * a difference of opinion is commonly reported.
 */

export const REVIEWED = false;

export type SurahSummary = {
  /** two or three sentences: what it is about, and what it asks of the reader */
  summary: string;
  /** only where scholars are commonly reported to differ on where it was revealed */
  dispute?: string;
};

export const SURAH_SUMMARY: Record<number, SurahSummary> = {
  72: { summary: "A group of jinn heard the Prophet ﷺ reciting the Qur'an and believed in it. The surah reports their own words as they went back and told their people what they had heard. It shows that the truth of the Qur'an is recognised even beyond the world we can see." },
  73: { summary: "Addressed to the Prophet ﷺ as he lay wrapped in his cloak, calling him to stand in prayer through the night. It sets night prayer and patience as the preparation for the weight of the message he was about to carry." },
  74: { summary: "One of the earliest revelations, telling the Prophet ﷺ to rise and warn. It marks the beginning of his public call, and warns of what awaits those who turn away in arrogance." },
  75: { summary: "About the Day of Resurrection and the certainty that people will be raised and shown everything they did. It answers those who doubted that God could gather their bones again, and describes the moment the soul reaches the throat." },
  76: { summary: "Describes how the human being was created from a small drop and given the ability to choose their way. It then describes what is prepared for those who feed the poor, the orphan and the captive, seeking nothing but God's pleasure." },
  77: { summary: "Opens with an oath by the winds sent forth, and warns of the Day of Judgement. A single line — woe that Day to the deniers — returns again and again as each sign is set out." },
  78: { summary: "Begins by asking what people are questioning one another about: the great news of the Day of Resurrection. It points to the earth, the mountains, sleep and the sky as signs that the One who made all this can raise the dead." },
  79: { summary: "Opens with oaths by the angels who draw out souls, then turns to the Day of Judgement. It recalls Musa's call to Pharaoh as an example of what becomes of a man who thinks himself beyond accountability." },
  80: { summary: "Revealed when the Prophet ﷺ turned away from a blind man who came seeking knowledge while he was speaking to the leaders of Quraysh. It is a correction, and a reminder that a person's worth is not measured by their standing." },
  81: { summary: "Describes the unmaking of the world: the sun folded up, the stars falling, the seas set alight. It then affirms that the Qur'an is the word of God, brought by a noble messenger." },
  82: { summary: "The sky splitting, the graves overturned, and every soul knowing what it sent ahead of itself. It reminds the reader that what we do is recorded, and that the record will be read back." },
  83: { summary: "A warning to those who give short measure — who take in full but give less than is due. It sets the record of the wicked beside the record of the righteous, and what waits for each." },
  84: { summary: "The sky splitting open and obeying its Lord, and every person meeting their Lord carrying their record. It describes the two ways that record may be handed over, and asks why people still do not believe." },
  85: { summary: "Tells of a people thrown into a trench of fire for nothing but believing in God, and warns those who persecute the believers. It was a comfort to the early Muslims in Makkah who were being harmed for their faith." },
  86: { summary: "An oath by the night-comer, the piercing star. It reminds the human being of the small thing they were created from, and that the One who made them from it is able to return them after death." },
  87: { summary: "Begins with the command to glorify the name of your Lord, the Most High. It moves through creation and revelation to a plain comparison: this life passes, and the Hereafter is better and lasting." },
  88: { summary: "Opens with the overwhelming event, then sets two faces side by side — one worn and weary in the Fire, one content in the Garden. It then turns to the camel, the sky, the mountains and the earth as signs anyone can look at." },
  89: { summary: "Swears by the dawn, then recalls nations destroyed for their arrogance: 'Ad, Thamud and Pharaoh. It turns to how people treat wealth and the orphan, and ends with the soul at peace being called back to its Lord." },
  90: { summary: "Swears by the city of Makkah and says the human being was created into hardship. It then describes the steep path most people do not take — freeing a slave, feeding the hungry, and being among those who urge one another to patience and mercy." },
  91: { summary: "Eleven oaths by the sun, the moon, the day, the night, the sky, the earth and the soul itself, all leading to one point: whoever purifies their soul has succeeded, and whoever corrupts it has failed." },
  92: { summary: "Contrasts two kinds of people: the one who gives, is mindful of God and believes in the best reward, and the one who withholds and thinks he needs nothing. Each is made easy towards a very different end." },
  93: { summary: "Revealed after a pause in revelation, reassuring the Prophet ﷺ that his Lord had neither left him nor turned away. It reminds him how he was cared for as an orphan, and tells him to be gentle with the orphan and the one who asks." },
  94: { summary: "Follows directly from the surah before it, reminding the Prophet ﷺ that his chest was expanded and his burden lifted from him. Its promise — that with hardship comes ease — is said twice, not once." },
  95: { summary: "Swears by the fig, the olive, Mount Sinai and the secure city. It states that the human being was made in the best form, then falls to the lowest of the low — except those who believe and do good." },
  96: { summary: "Contains the first words ever revealed to the Prophet ﷺ: Read, in the name of your Lord who created. The later verses warn a man who tried to stop a servant of God from praying." },
  97: { summary: "About the Night of Decree, on which the Qur'an was sent down — a night better than a thousand months. It describes the angels descending with every matter, and peace until the break of dawn." },
  98: { summary: "About the clear evidence that came to the People of the Book and to the idolaters: a messenger reciting purified pages. It states plainly what religion asks for — sincerity, prayer and charity." },
  99: { summary: "The earth shaking with its final earthquake, giving up what it holds and telling its news. It ends with a promise that is easy to remember and hard to forget: an atom's weight of good or evil will be seen." },
  100: { summary: "Opens with oaths by galloping horses, then turns to the human being who is ungrateful to his Lord and fierce in his love of wealth. It asks whether he knows what happens when the graves are emptied." },
  101: { summary: "The Striking Hour, when people will be like scattered moths and the mountains like carded wool. Deeds are weighed, and the surah describes what becomes of the one whose scales are light." },
  102: { summary: "Competing for more and more of this world distracts people until they reach the graves. It warns that they will come to know, and that they will be asked about the blessings they enjoyed." },
  103: { summary: "Three short verses swearing by time: the human being is in loss, except those who believe, do good, and urge one another to truth and to patience. Its brevity is part of why it is so often quoted." },
  104: { summary: "A warning to the one who slanders and mocks others, and who piles up wealth as though it will make him last forever. It describes the Fire that will close over him." },
  105: { summary: "Recalls the army with the elephant that came to destroy the Ka'bah, and how God sent birds against them. This happened in the year the Prophet ﷺ was born, so it was recent memory in Makkah — few words were needed." },
  106: { summary: "Reminds Quraysh of the safety and provision they enjoyed through their winter and summer trading journeys. It then calls them to worship the Lord of this House, who fed them against hunger and made them safe from fear." },
  107: { summary: "Asks who it is that really denies the Judgement, and answers: the one who pushes the orphan away and does not encourage feeding the poor. It then warns those who pray while heedless of their prayer and withhold even small kindnesses." },
  108: { summary: "The shortest surah in the Qur'an. It tells the Prophet ﷺ that he has been given abundance, commands prayer and sacrifice, and answers those who mocked him by saying he would be forgotten." },
  109: { summary: "A clear line drawn between worshipping God and worshipping anything else, given when Quraysh suggested each side take turns in the other's religion. It ends: for you your religion, and for me mine." },
  110: { summary: "Revealed near the end of the Prophet's ﷺ life, when the help of God came and people entered Islam in crowds. At the moment of success it commands praise and asking forgiveness, rather than celebration." },
  111: { summary: "About Abu Lahab, the Prophet's ﷺ own uncle, who opposed him openly, and his wife who carried thorns to put in his path. It was revealed while they were both still alive." },
  112: {
    summary: "Answers a question about who God is: One, absolute, who does not give birth and was not born, and who has no equal. The Prophet ﷺ described it as equal to a third of the Qur'an.",
    dispute: "Most scholars hold it to be Makkan; some report it as Madinan.",
  },
  113: { summary: "A prayer for refuge with the Lord of daybreak — from the harm of what He created, from the night when it darkens, and from envy. With the surah after it, the two are known together as the Mu'awwidhatayn." },
  114: { summary: "A prayer for refuge with the Lord, the King and the God of mankind, from the whispering that slips into the heart. It completes the pair begun in Al-Falaq." },
};
