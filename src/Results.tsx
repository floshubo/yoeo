import { useState } from "react";
import type { Report } from "./types";
import { Badge, Button, Icon, Topbar } from "./components";
import { imageFor, groupFor } from "./data";
import { useI18n } from "./i18n";
export default function Results({
  report,
  onHome,
  onBack,
  saving = false,
  onSave,
  saved,
  initialResults = false,
}: {
  report: Report;
  onHome: () => void;
  onBack: () => void;
  saving?: boolean;
  onSave: (r: Report) => void;
  saved: boolean;
  initialResults?: boolean;
}) {
  const { t, language } = useI18n();
  const [showResults, setShowResults] = useState(initialResults);
  const [selected, setSelected] = useState<string[]>(
    initialResults ? report.dishes.map((d) => d.id) : [],
  );
  const [filter, setFilter] = useState("All");
  const [details, setDetails] = useState<string[]>([]);
  const dishes = report.dishes.filter((d) => selected.includes(d.id));
  const foundAllergens = Array.from(
    new Map(dishes.flatMap((dish) => dish.allergens).map((allergen) => [allergen.name, allergen])).values(),
  );
  return (
    <div className="page results">
      <Topbar
        title={showResults ? t("Allergen Check") : t("Select what to show")}
        onBack={() => (showResults && !initialResults ? setShowResults(false) : onBack())}
        onClose={!showResults ? onBack : undefined}
      />
      {!showResults ? (
        <>
          <div className="scroll-body selection-body">
            <button
              className="show-all"
              onClick={() => {
                setSelected(report.dishes.map((d) => d.id));
                setShowResults(true);
              }}
            >
              <span>
                <strong>{t("Show all results")}</strong>
                <span>{t("Check all {count} dishes at once", { count: report.dishes.length })}</span>
              </span>
              <Icon name="right" />
            </button>
            <p>{t("Or select specific dishes")}</p>
            <div className="dish-options">
              {report.dishes.map((d) => (
                <label key={d.id} className={`dish-option ${selected.includes(d.id)?'is-selected':''}`}>
                  <strong>{d.name}</strong>
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={() =>
                      setSelected((a) =>
                        a.includes(d.id)
                          ? a.filter((id) => id !== d.id)
                          : [...a, d.id],
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="fixed-actions">
            <Button
              disabled={!selected.length}
              onClick={() => setShowResults(true)}
            >
              {t("Check {count} dishes", { count: selected.length })}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="scroll-body results-body">
            <div className="result-counts">
              {["Critical", "Avoid", "Uncertain"].map((s) => (
                <button
                  key={s}
                  className={`${s.toLowerCase()} ${filter === s ? "selected" : ""}`}
                  onClick={() => setFilter((v) => (v === s ? "All" : s))}
                  aria-pressed={filter === s}
                >
                  <strong>{dishes.filter((d) => d.status === s).length}</strong>
                  <span>{t(s)}</span>
                </button>
              ))}
            </div>
            <section className="report-overview" aria-labelledby="allergens-found-heading">
              <h2 id="allergens-found-heading">{t("Allergens found")}</h2>
              {foundAllergens.length ? (
                <div className="found-allergens">
                  {foundAllergens.map((allergen) => (
                    <span key={allergen.name} className={allergen.severity.toLowerCase()}>
                      {t(allergen.name)}
                    </span>
                  ))}
                </div>
              ) : (
                <p>{t("No allergens were identified. Safety is still unconfirmed.")}</p>
              )}
            </section>
            <h2 className="menu-results-heading">{t("Menu")}</h2>
            <div className="report-dishes">
              {dishes
                .filter((d) => filter === "All" || d.status === filter)
                .map((d) => (
                  <article className="dish-card" key={d.id}>
                    <h2>{d.name}</h2>
                    {d.allergens.length ? (
                      d.allergens.map((a, i) => (
                        <div
                          key={`${a.name}-${i}`}
                          className={`allergen-row ${a.severity.toLowerCase()}`}
                        >
                          <img
                            src={imageFor(a.name,a.severity==='Untracked'?'Avoid':a.severity)}
                            alt=""
                            width="60"
                            height="60"
                          />
                          <span className="allergen-label">
                            <span>{t(a.name)}</span>
                            <small>{t(groupFor(a.name))}</small>
                            <small className="possible">{a.source==='legend'?t('From allergen list'):a.certainty==='declared'?t('Declared on menu'):t('AI estimate')}</small>
                          </span>
                          <Badge value={a.severity} />
                        </div>
                      ))
                    ) : (
                      <div className="uncertain-result">
                        <span className="question-mark">?</span>
                        <span>
                          {t("No allergens identified")}
                          <br />
                          <small>{t("Safety is unconfirmed")}</small>
                        </span>
                      </div>
                    )}
                    <button
                      className="text-button details-toggle"
                      onClick={() =>
                        setDetails((a) =>
                          a.includes(d.id)
                            ? a.filter((id) => id !== d.id)
                            : [...a, d.id],
                        )
                      }
                      aria-expanded={details.includes(d.id)}
                    >
                      {t("Evidence & questions")}{" "}
                      <span>{details.includes(d.id) ? "−" : "+"}</span>
                    </button>
                    {details.includes(d.id) && (
                      <div className="evidence">
                        <p>{d.description}</p>
                        {d.ingredients.length > 0 && (
                          <p>
                            <strong>{t("Visible / listed ingredients:")}</strong>{" "}
                            {d.ingredients.join(", ")}
                          </p>
                        )}
                        {d.allergens.map((a, i) => (
                          <p key={i}>
                            <strong>
                              {t(a.name)} ·{" "}
                              {a.certainty === "declared"
                                ? t("Declared")
                                : t("Possible")}
                              :
                            </strong>{" "}
                            {a.evidence}
                          </p>
                        ))}
                        {d.uncertainties.length > 0 && (
                          <>
                            <h3>{t("What we couldn’t confirm")}</h3>
                            <ul>
                              {d.uncertainties.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {d.questions.length > 0 && (
                          <>
                            <h3>{t("Ask the restaurant")}</h3>
                            <ul>
                              {d.questions.map((q, i) => (
                                <li key={i}>{q}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))}
            </div>
            {!dishes.some((d) => filter === "All" || d.status === filter) && (
              <p className="empty-note">{t("No dishes in this category.")}</p>
            )}
            <div className="report-note">
              <strong>{t("Confirm before you eat")}</strong>
              {report.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
            {(report.legend?.length || report.allergenListText) && (
              <details className="transcript">
                <summary>{t("Read the allergen list")}</summary>
                {!!report.legend?.length && (
                  <dl className="legend-mappings">
                    {report.legend.map((entry, index) => (
                      <div key={`${entry.code}-${index}`}>
                        <dt>{entry.code}</dt>
                        <dd>{entry.label}{entry.allergens.length ? ` · ${entry.allergens.join(", ")}` : ""}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {report.allergenListText && <pre>{report.allergenListText}</pre>}
              </details>
            )}
            <details className="transcript">
              <summary>{t("Read the menu")}</summary>
              <pre>{report.menuText || report.extractedText || t("No additional menu text was extracted.")}</pre>
            </details>
            <p className="privacy-note">
              {t("Analysis from {date}. Based on your allergen profile at that time.", { date: new Date(report.createdAt).toLocaleString(language) })}
            </p>
          </div>
          <div className="fixed-actions">
            <Button
              disabled={saved || saving}
              onClick={() => onSave({ ...report, dishes })}
            >
              {saving ? t("Checking subscription…") : saved ? t("Results saved on this device") : t("Save results")}
            </Button>
            <Button secondary onClick={onHome}>
              {t("Back to home")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
