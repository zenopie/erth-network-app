import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLoading } from "../contexts/LoadingContext";
import { registrationCount, registrationCountries } from "../chain/personhood";
import { status } from "../chain/explorer";
import styles from "./About.module.css";

/**
 * What Earth Network is, for someone who has just arrived.
 *
 * Replaces the ANML claim page as the app's front door. Claiming was a fine
 * first screen for people who already knew what ANML was and a poor one for
 * everybody else — it asked for a passport before saying why.
 *
 * The page leads with people rather than with tokenomics because that is what
 * is actually unusual here. Every chain has an emission schedule; almost none
 * of them can tell one person from ten.
 */
const About = () => {
  const { hideLoading } = useLoading();
  const [humans, setHumans] = useState(null);
  const [countries, setCountries] = useState(null);
  const [height, setHeight] = useState(null);

  useEffect(() => {
    hideLoading();

    // Live, because the whole claim of the page is that these are real people
    // and a real chain. A hardcoded number on a page about counting humans
    // would undercut the one thing it is trying to say.
    let cancelled = false;
    (async () => {
      const [c, s, cs] = await Promise.all([
        registrationCount().catch(() => null),
        status().catch(() => null),
        registrationCountries().catch(() => null),
      ]);
      if (cancelled) return;
      setHumans(c);
      setHeight(s?.height ?? null);
      setCountries(Array.isArray(cs) ? cs.length : null);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.page}>

      <header className={styles.hero}>
        <div className={styles.inner}>
        <p className={styles.eyebrow}>Earth Network</p>
        <h1 className={styles.title}>
          A blockchain that can tell<br />one person from a thousand.
        </h1>
        <p className={styles.lede}>
          Every other chain measures you by what you own. Earth can also measure
          you by <em>being someone</em> — proved with your passport, on your own
          phone, without handing over a single detail from it.
        </p>

        <div className={styles.stats}>
          <Stat value={humans} label="verified humans" />
          <Stat value={countries} label="countries" />
          <Stat value={height} label="blocks" />
        </div>
        </div>
      </header>

      <section className={styles.band}>
        <div className={styles.inner}>
        <h2 className={styles.h2}>How you prove you are a person</h2>
        <p className={styles.body}>
          Your passport already carries a chip signed by the country that issued
          it. Earth checks that signature — and nothing else leaves your hands.
        </p>

        <ol className={styles.steps}>
          <Step n="1" title="Read the chip">
            You hold your passport against your phone. The app reads the chip
            over NFC, the same way a border gate does.
          </Step>
          <Step n="2" title="Prove it on your device">
            Your phone builds a zero-knowledge proof: a piece of maths showing
            a validly signed passport was read, which reveals nothing about
            whose it was. This happens on the device. The passport data never
            travels.
          </Step>
          <Step n="3" title="Register the proof, not you">
            Only the proof is broadcast, alongside a one-way identifier that
            stops the same passport registering twice. It cannot be turned back
            into your passport, your name, or your face.
          </Step>
        </ol>

        <p className={styles.aside}>
          Your name, number, photo and date of birth are never sent anywhere —
          not to us, not to the chain, not to anyone. We could not hand them
          over if we were asked, because we never receive them.
        </p>
        </div>
      </section>

      <section className={styles.bandAlt}>
        <div className={styles.inner}>
        <h2 className={styles.h2}>Four streams, forever</h2>
        <p className={styles.body}>
          Earth issues exactly <strong>4 ERTH every second</strong> and always
          will. Not a schedule, not a halving — one rate, split four ways.
        </p>

        <div className={styles.matrix}>
          <Pillar
            tag="People · individual"
            title="ANML"
            body="One human, one daily claim. The same for everyone, whatever they hold."
          />
          <Pillar
            tag="People · collective"
            title="Caretaker Fund"
            body="One human, one vote, on where this share of the emission goes."
          />
          <Pillar
            tag="Capital · individual"
            title="Staking"
            body="Ordinary staking rewards, in proportion to what you have bonded."
          />
          <Pillar
            tag="Capital · collective"
            title="Groundworks Fund"
            body="Stake-weighted votes on what the network builds next."
          />
        </div>

        <p className={styles.aside}>
          Half of what Earth issues is decided by people rather than by holdings.
          That is the part you cannot buy more of.
        </p>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.inner}>
        <h2 className={styles.h2}>Why a fixed rate gets gentler</h2>
        <p className={styles.body}>
          Because the rate never changes while the supply it adds to keeps
          growing, inflation falls on its own — roughly 5% in the first year,
          drifting toward 2.5% by the twentieth. Nobody has to vote for that. It
          is arithmetic, and there is no schedule anyone can get wrong.
        </p>
        </div>
      </section>

      <section className={styles.bandAlt}>
        <div className={styles.inner}>
        <h2 className={styles.h2}>Plainly said</h2>
        <ul className={styles.plain}>
          <li>
            <strong>It is public.</strong> Balances, transactions and votes are
            readable by anyone. Personhood is private; your money is not.
          </li>
          <li>
            <strong>There are no contracts.</strong> Staking, the exchange,
            allocations and personhood are modules built into the chain itself.
          </li>
          <li>
            <strong>Your keys are yours.</strong> They are generated and held on
            your device. We cannot freeze, move or recover them.
          </li>
        </ul>
        </div>
      </section>

      <footer className={styles.band}>
        <div className={styles.inner}>
        <h2 className={styles.ctaTitle}>Start where you like</h2>
        <div className={styles.ctaRow}>
          <Link to="/stake-erth" className={styles.primary}>Stake ERTH</Link>
          <Link to="/swap-tokens" className={styles.secondary}>Swap tokens</Link>
          <Link to="/explorer" className={styles.secondary}>Explore the chain</Link>
        </div>
        <p className={styles.fine}>
          To register as a verified human you will need the Earth Wallet mobile
          app — the passport chip is read over NFC, which a browser cannot do.
        </p>
        </div>
      </footer>
    </div>
  );
};

/**
 * A live figure, or a placeholder that does not pretend to be one.
 *
 * A zero here would read as "nobody has registered" rather than "not loaded
 * yet", and on this page of all pages that is the wrong thing to say by
 * accident.
 */
const Stat = ({ value, label }) => (
  <div className={styles.stat}>
    <span className={styles.statValue}>
      {value === null || value === undefined ? "—" : Number(value).toLocaleString()}
    </span>
    <span className={styles.statLabel}>{label}</span>
  </div>
);

const Step = ({ n, title, children }) => (
  <li className={styles.step}>
    <span className={styles.stepNum}>{n}</span>
    <div>
      <h3 className={styles.stepTitle}>{title}</h3>
      <p className={styles.stepBody}>{children}</p>
    </div>
  </li>
);

/**
 * One of the four streams.
 *
 * The tag carries the axes — people or capital, individual or collective —
 * rather than a row and column label around the grid. Labels outside the grid
 * vanish the moment it collapses to one column on a phone, taking the whole
 * point of the 2x2 with them; on the card they survive.
 */
const Pillar = ({ tag, title, body }) => (
  <div className={styles.pillar}>
    <p className={styles.pillarTag}>{tag}</p>
    <h3 className={styles.pillarTitle}>{title}</h3>
    <p className={styles.pillarBody}>{body}</p>
  </div>
);

export default About;
