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
    title: "Start with three cards",
    description: "Look at the artwork and card names. Release details stay hidden while you play.",
  },
  {
    order: [0, 1, 2],
    title: "Put them in release order",
    description: <>Use <strong>Earlier</strong> and <strong>Later</strong> to move cards, then select <strong>Lock order</strong>.</>,
    note: "Move Snatch earlier",
  },
  {
    order: [0, 1, 2],
    title: "Reveal the timeline",
    description: "A correct order adds a card to the next round. Your first miss ends the streak.",
    note: "Level cleared · Next round: four cards",
  },
];

const faq = [
  ["Which release counts?", "Each illustration is dated by its first documented official commercial set release."],
  ["Does alternate artwork count separately?", "Distinct alternate art has its own date. Reprints, foil, and border changes of the same illustration share its earliest commercial date."],
  ["Do promos count?", "Promo distributions do not establish a date. If that same artwork later appears in a commercial set, its first commercial release counts."],
  ["What stays hidden while I play?", "You see the illustration and card name. The full card, collector details, set, and release date appear in the result."],
  ["What is recorded?", "This browser keeps your most recent finished run. Streak records your highest level cleared, Timed records the outcome, and Untimed records your elapsed time only on a correct order."],
];

export function ChronicleGuide() {
  return (
    <>
      <section id="how" aria-labelledby="chronicle-how">
        <h2 id="chronicle-how">How to play</h2>
        <p>Start with Streak and put three illustrations in release order.</p>
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
          <div><dt>Timed</dt><dd>Order three cards before the 30-second countdown ends.</dd></div>
          <div><dt>Untimed</dt><dd>Play one round at your own pace. Your time is recorded on a correct order.</dd></div>
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
