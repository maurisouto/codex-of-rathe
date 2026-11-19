import Image from "next/image";

import artOfWar from "./assets/guide-art-of-war.webp";
import channelMountHeroic from "./assets/guide-channel-mount-heroic.webp";
import snatch from "./assets/guide-snatch.webp";
import styles from "./chronicle.module.css";

const guideCards = [
  { name: "Snatch", image: snatch, date: "11 Oct 2019", dateTime: "2019-10-11" },
  { name: "Art of War", image: artOfWar, date: "27 Mar 2020", dateTime: "2020-03-27" },
  { name: "Channel Mount Heroic", image: channelMountHeroic, date: "24 Sep 2021", dateTime: "2021-09-24" },
] as const;

const scenes = [
  {
    order: [1, 0, 2],
    title: "Open the chronicle",
    description: "Study the three illustrations and their names. Their release dates lie beyond the veil until the round ends.",
  },
  {
    order: [0, 1, 2],
    title: "Trace the timeline",
    description: <>Arrange the art from earliest to latest with <strong>Earlier</strong> and <strong>Later</strong>. Select <strong>Lock order</strong> to seal your answer.</>,
    note: "Move Snatch earlier",
  },
  {
    order: [0, 1, 2],
    title: "Unveil the record",
    description: "A correct order opens the next chapter with one more card. One wrong order ends the streak.",
    note: "Level cleared · Next round: four cards",
  },
];

const faq = [
  ["Where does an illustration’s story begin?", "The chronicle dates each illustration to its first documented release in an official commercial set."],
  ["Can one card have two histories?", "Distinct alternate art begins a new entry with its own date. Reprints, foil editions, and new borders share the original illustration’s earliest commercial date."],
  ["Do promos enter the chronicle?", "Promotional releases leave no date in the record. If the same art later appears in a commercial set, that first commercial release counts."],
  ["What lies beyond the veil?", "Only the illustration and card name are visible during play. The result reveals the full card, collector details, set, and release date."],
  ["What does the chronicle remember?", "Your browser keeps your latest completed run. Streak keeps the highest level you cleared. Timed keeps the outcome. Untimed records elapsed time only for a correct order."],
];

export function ChronicleGuide() {
  return (
    <>
      <section id="how" aria-labelledby="chronicle-how">
        <h2 id="chronicle-how">How to play</h2>
        <p>Begin with Streak and arrange three illustrations from earliest to latest.</p>
        <ol className={styles.guideGrid}>
          {scenes.map(({ order, title, description, note }, scene) => (
            <li key={title} className={styles.guidePanel}>
              <div className={styles.guideScene}>
                {scene === 1 && <div className={styles.guideAxis}><span>Earliest</span><span>Latest</span></div>}
                <ol className={styles.guideCards} aria-label={title}>
                  {order.map((index) => {
                    const card = guideCards[index];
                    return (
                      <li key={card.name} className={scene === 1 && index === 0 ? styles.highlight : undefined}>
                        <Image src={card.image} alt="" sizes="(max-width: 760px) 26vw, 120px" />
                        <span>{card.name}</span>
                        {scene === 2 && <time dateTime={card.dateTime}>{card.date}</time>}
                      </li>
                    );
                  })}
                </ol>
                {note && <p className={styles.guideNote}>{note}</p>}
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <dl className={styles.guideModes}>
          <div><dt>Timed</dt><dd>Set three cards in order before the last grain of the 30-second hourglass falls.</dd></div>
          <div><dt>Untimed</dt><dd>Follow the trail at your own pace in a single round. Only a correct order earns a recorded time.</dd></div>
        </dl>
      </section>
      <section id="faq" aria-labelledby="chronicle-faq">
        <h2 id="chronicle-faq">FAQ</h2>
        {faq.map(([question, answer]) => (
          <details key={question} className={styles.faq}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
    </>
  );
}
