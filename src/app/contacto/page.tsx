'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './contacto.module.css';
import {
    PLANS,
    FOUNDER_PROMO_ENABLED,
    FOUNDER_PROMO_MONTHS,
    type PlanTier,
} from '@/lib/billing/plans';

const FAQS = [
    {
        q: '¿Necesito conocimientos técnicos?',
        a: 'No. G22 Scores está diseñado para que cualquier organizador pueda usarlo de forma intuitiva sin manuales complejos.',
    },
    {
        q: '¿Los jugadores pueden ver resultados?',
        a: 'Sí. Generamos una página pública optimizada para móviles donde pueden consultar todo en tiempo real.',
    },
    {
        q: '¿Sirve para distintos deportes?',
        a: 'Absolutamente. Es flexible para deportes de equipo, individuales y formatos de eliminación o liga.',
    },
];

export default function ContactoPage() {
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const router = useRouter();

    const goToCheckout = (tier: PlanTier) => {
        router.push(`/checkout/${tier}`);
    };

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const elements = root.querySelectorAll(`.${styles.reveal}`);
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add(styles.active);
                    }
                });
            },
            { threshold: 0.1 }
        );
        elements.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const subject = encodeURIComponent('Solicitud de demo · G22 Scores');
        const body = encodeURIComponent(
            [
                `Nombre: ${data.get('nombre') || ''}`,
                `Organización: ${data.get('organizacion') || ''}`,
                `Email: ${data.get('email') || ''}`,
                `Deporte: ${data.get('deporte') || ''}`,
                `Equipos: ${data.get('equipos') || ''}`,
                '',
                'Mensaje:',
                String(data.get('mensaje') || ''),
            ].join('\n')
        );
        window.location.href = `mailto:hola@g22scores.com?subject=${subject}&body=${body}`;
    };

    const scrollToContact = () => {
        document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' });
    };

    const scrollToFunciones = () => {
        document.getElementById('funciones')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div ref={rootRef} className={styles.page}>
            {/* Hero */}
            <section className={styles.hero}>
                <div className={styles.heroCol}>
                    <span className={`${styles.heroEyebrow} ${styles.mono} ${styles.reveal}`}>
                        Professional Sports Infrastructure
                    </span>
                    <h1 className={`${styles.heroTitle} ${styles.reveal}`}>
                        Gestioná tus torneos de forma{' '}
                        <span className={styles.heroTitleAccent}>profesional</span>.
                    </h1>
                    <p className={`${styles.heroSubtitle} ${styles.reveal}`}>
                        Organizá fixtures, resultados, tablas de posiciones y estadísticas desde
                        una sola plataforma estructural.
                    </p>
                    <div className={`${styles.heroActions} ${styles.reveal}`}>
                        <button type="button" className={styles.btnPrimary} onClick={scrollToContact}>
                            Solicitar demo
                        </button>
                        <button type="button" className={styles.btnOutline} onClick={scrollToFunciones}>
                            Ver cómo funciona
                        </button>
                    </div>
                </div>

                <div className={`${styles.heroCol} ${styles.mockupContainer} ${styles.reveal}`}>
                    <div className={styles.mockupCard}>
                        <div className={styles.mockHeader}>
                            <span className={`${styles.mockDot} ${styles.mockDotRed}`}></span>
                            <span className={`${styles.mockDot} ${styles.mockDotYellow}`}></span>
                            <span className={`${styles.mockDot} ${styles.mockDotGreen}`}></span>
                            <span className={`${styles.mockLabel} ${styles.mono}`}>
                                Dashboard Admin / Liga G22
                            </span>
                        </div>
                        <div className={styles.mockGrid}>
                            <div className={styles.mockTile}>
                                <p className={`${styles.mockTileTitle} ${styles.mono}`}>Tabla de Posiciones</p>
                                <div className={styles.mockBars}>
                                    <div className={styles.mockBar}></div>
                                    <div className={`${styles.mockBar} ${styles.mockBarSm}`}></div>
                                    <div className={`${styles.mockBar} ${styles.mockBarMd}`}></div>
                                </div>
                            </div>
                            <div className={styles.mockTile}>
                                <p className={`${styles.mockTileTitle} ${styles.mono}`}>Resultados en Vivo</p>
                                <div className={`${styles.mockScore} ${styles.mono}`}>
                                    <span>FC BAR</span>
                                    <span className={styles.mockScoreValue}>2 - 1</span>
                                    <span>R MAD</span>
                                </div>
                            </div>
                            <div className={styles.mockHero}>
                                <div className={styles.mockHeroHeader}>
                                    <span className={`${styles.mockTileTitle} ${styles.mono}`}>Fixture Automático</span>
                                    <span className={`${styles.mockBadge} ${styles.mono}`}>FECHA 12</span>
                                </div>
                                <div className={styles.mockHeroGrid}>
                                    <div className={styles.mockHeroCell}></div>
                                    <div className={styles.mockHeroCell}></div>
                                    <div className={styles.mockHeroCell}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Impact */}
            <div className={styles.structuralLine}></div>
            <section className={`${styles.impact} ${styles.reveal}`}>
                <h2 className={styles.impactTitle}>
                    Menos <span className={styles.impactItalic}>planillas</span>, menos errores,
                    más tiempo para <span className={styles.impactStrong}>hacer crecer</span> tu
                    torneo.
                </h2>
            </section>
            <div className={styles.structuralLine}></div>

            {/* Audience */}
            <section className={styles.section}>
                <div className={styles.sectionHead}>
                    <h3 className={`${styles.sectionEyebrow} ${styles.mono}`}>Target Audience</h3>
                    <h2 className={styles.sectionTitle}>
                        Diseñado para la <br />
                        profesionalización.
                    </h2>
                </div>
                <div className={styles.audienceGrid}>
                    {[
                        {
                            n: '01',
                            t: 'Clubes deportivos',
                            d: 'Gestioná categorías, equipos y fechas desde un solo lugar centralizado.',
                        },
                        {
                            n: '02',
                            t: 'Ligas amateurs',
                            d: 'Publicá resultados, posiciones y próximos partidos de manera simple.',
                        },
                        {
                            n: '03',
                            t: 'Torneos privados',
                            d: 'Ideal para fútbol, pádel, básquet, vóley, hockey y mucho más.',
                        },
                        {
                            n: '04',
                            t: 'Organizadores',
                            d: 'Ahorrá tiempo operativo y ofrecé una experiencia UX superior.',
                        },
                    ].map((card) => (
                        <div key={card.n} className={styles.audienceCard}>
                            <div className={styles.audienceNumber}>{card.n}</div>
                            <h4 className={styles.audienceTitle}>{card.t}</h4>
                            <p className={styles.audienceText}>{card.d}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Pain points (light invert) */}
            <section className={`${styles.painSection} ${styles.reveal}`}>
                <div className={styles.painInner}>
                    <div>
                        <h2 className={styles.painTitle}>Sabemos lo difícil que es organizar un torneo</h2>
                        <p className={styles.painLead}>
                            G22 Scores centraliza toda la gestión para que tu torneo funcione mejor
                            desde el primer día.
                        </p>
                    </div>
                    <div className={styles.painList}>
                        {[
                            'Fixtures armados manualmente',
                            'Resultados enviados por WhatsApp',
                            'Tablas de posiciones desactualizadas',
                            'Reclamos por errores de carga',
                            'Falta de estadísticas claras',
                        ].map((item) => (
                            <div key={item} className={styles.painItem}>
                                <span className={styles.painCross}>✕</span> <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="funciones" className={styles.section}>
                <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
                    Todo lo que necesitás
                </h2>
                <div className={styles.featuresGrid}>
                    {[
                        {
                            t: 'Fixture Automático',
                            d: 'Armá calendarios de partidos de forma simple, ordenada y lógica.',
                        },
                        {
                            t: 'Resultados y Posiciones',
                            d: 'Cargá resultados y actualizá tablas automáticamente en tiempo real.',
                        },
                        {
                            t: 'Estadísticas',
                            d: 'Mostrá goleadores, tarjetas, puntos y estadísticas individuales.',
                        },
                        {
                            t: 'Página Pública',
                            d: 'Compartí fixture y resultados con el público a través de una URL dedicada.',
                        },
                        {
                            t: 'Panel de Admin',
                            d: 'Controlá toda la operación desde un dashboard claro y fácil de usar.',
                        },
                        {
                            t: 'Acceso Mobile',
                            d: 'Los jugadores pueden consultar todo desde sus celulares sin fricción.',
                        },
                    ].map((feature) => (
                        <div key={feature.t} className={styles.statCard}>
                            <h4 className={styles.featureTitle}>{feature.t}</h4>
                            <p className={styles.featureText}>{feature.d}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Plans */}
            <section id="precios" className={styles.plansSection}>
                <div className={styles.plansInner}>
                    <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
                        Planes que escalan
                    </h2>
                    <div className={styles.plansGrid}>
                        {(['inicial', 'pro', 'organizacion'] as const).map((tier, idx) => {
                            const plan = PLANS[tier];
                            const featured = plan.isRecommended;
                            const tierLabel = `TIER 0${idx + 1}`;
                            const showFounder = FOUNDER_PROMO_ENABLED && plan.founderPriceUsd != null;
                            const effectivePrice = showFounder ? plan.founderPriceUsd : plan.listPriceUsd;
                            const isContactSales = plan.isContactSales;

                            const ctaLabel = isContactSales
                                ? 'Solicitar Propuesta'
                                : tier === 'inicial'
                                    ? 'Empezar con Inicial'
                                    : 'Contratar Plan Pro';

                            const onCta = isContactSales
                                ? scrollToContact
                                : () => goToCheckout(tier);

                            const cardClass = featured
                                ? styles.planCardFeatured
                                : `${styles.glassPanel} ${styles.planCard}`;

                            const tierClass = featured
                                ? `${styles.planTier} ${styles.planTierMuted} ${styles.mono}`
                                : `${styles.planTier} ${styles.mono}`;

                            const titleClass = featured
                                ? styles.planTitleFeatured
                                : styles.planTitle;

                            const subtitleClass = featured
                                ? `${styles.planSubtitle} ${styles.planSubtitleDark}`
                                : styles.planSubtitle;

                            const listClass = featured
                                ? `${styles.planList} ${styles.planListDark}`
                                : styles.planList;

                            const btnClass = featured
                                ? `${styles.btnPrimary} ${styles.btnPrimaryFull} ${styles.btnPrimaryDark}`
                                : `${styles.btnOutline} ${styles.btnOutlineFull}`;

                            const periodClass = featured
                                ? `${styles.planPricePeriod} ${styles.planPricePeriodDark}`
                                : styles.planPricePeriod;

                            const listedClass = featured
                                ? `${styles.planPriceListed} ${styles.planPriceListedDark}`
                                : styles.planPriceListed;

                            return (
                                <div key={tier} className={cardClass}>
                                    {featured && (
                                        <div className={`${styles.planBadge} ${styles.mono}`}>RECOMENDADO</div>
                                    )}
                                    <div className={tierClass}>{tierLabel}</div>
                                    <div>
                                        <h3 className={titleClass}>{plan.name}</h3>
                                        <p className={subtitleClass}>{plan.tagline}</p>
                                        <div className={styles.planPriceWrap}>
                                            {isContactSales && (
                                                <span className={styles.planFromHint}>DESDE</span>
                                            )}
                                            <span className={styles.planPrice}>
                                                USD {effectivePrice}
                                            </span>
                                            {showFounder && plan.founderPriceUsd !== plan.listPriceUsd && (
                                                <span className={listedClass}>
                                                    USD {plan.listPriceUsd}
                                                </span>
                                            )}
                                            <span className={periodClass}>/ mes</span>
                                        </div>
                                        {showFounder && (
                                            <p className={styles.planFounderHint}>
                                                Precio fundador · {FOUNDER_PROMO_MONTHS} meses
                                            </p>
                                        )}
                                    </div>
                                    <ul className={listClass}>
                                        {plan.features.map((f) => (
                                            <li key={f}>• {f}</li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        className={btnClass}
                                        onClick={onCta}
                                    >
                                        {ctaLabel}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Contact */}
            <section id="contacto" className={`${styles.contactSection} ${styles.reveal}`}>
                <div className={styles.contactGrid}>
                    <div>
                        <h2 className={styles.contactTitle}>Solicitá tu Demo</h2>
                        <p className={styles.contactLead}>
                            Completá tus datos y te mostramos cómo G22 Scores puede transformar la
                            gestión de tu torneo.
                        </p>
                        <div className={styles.contactPills}>
                            <div className={styles.contactPill}>
                                <span className={styles.contactPillDot}></span> Torneos gestionados
                            </div>
                            <div className={styles.contactPill}>
                                <span className={styles.contactPillDot}></span> Plataforma intuitiva
                            </div>
                            <div className={styles.contactPill}>
                                <span className={styles.contactPillDot}></span> Soporte especializado
                            </div>
                        </div>
                    </div>

                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.formRow}>
                            <input name="nombre" type="text" placeholder="NOMBRE" className={styles.input} required />
                            <input name="organizacion" type="text" placeholder="ORGANIZACIÓN" className={styles.input} />
                        </div>
                        <input name="email" type="email" placeholder="EMAIL" className={styles.input} required />
                        <div className={styles.formRow}>
                            <select name="deporte" className={styles.select} defaultValue="">
                                <option value="" disabled>DEPORTE</option>
                                <option>Fútbol</option>
                                <option>Pádel</option>
                                <option>Básquet</option>
                                <option>Vóley</option>
                                <option>Hockey</option>
                                <option>Otro</option>
                            </select>
                            <input name="equipos" type="text" placeholder="EQUIPOS (CANT.)" className={styles.input} />
                        </div>
                        <textarea
                            name="mensaje"
                            rows={4}
                            placeholder="Mensaje adicional"
                            className={styles.textarea}
                        ></textarea>
                        <button type="submit" className={`${styles.btnPrimary} ${styles.btnPrimaryFull}`}>
                            Quiero una demo
                        </button>
                        <p className={styles.formNote}>Te contactamos en menos de 24hs para coordinar.</p>
                    </form>
                </div>
            </section>

            {/* FAQ */}
            <section className={styles.faqSection}>
                <h2 className={styles.faqTitle}>Preguntas Frecuentes</h2>
                <div className={styles.faqList}>
                    {FAQS.map((faq, idx) => {
                        const isOpen = openFaq === idx;
                        return (
                            <button
                                key={faq.q}
                                type="button"
                                className={styles.faqItem}
                                onClick={() => setOpenFaq(isOpen ? null : idx)}
                                aria-expanded={isOpen}
                            >
                                <div className={styles.faqHead}>
                                    <h4 className={styles.faqQuestion}>{faq.q}</h4>
                                    <span className={styles.faqToggle}>{isOpen ? '−' : '+'}</span>
                                </div>
                                <p className={`${styles.faqAnswer} ${isOpen ? styles.faqAnswerOpen : ''}`}>
                                    {faq.a}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
