import {
  EDITORIAL_GENRE_OPTIONS,
  EDITORIAL_TOPIC_OPTIONS
} from "../lib/editorial";
import type { EditorialGenre, EditorialPreferences, EditorialTopic } from "../types";

type EditorialPreferencesPickerProps = {
  preferences: EditorialPreferences;
  onChange: (preferences: EditorialPreferences) => void;
  compact?: boolean;
};

export function EditorialPreferencesPicker({
  preferences,
  onChange,
  compact = false
}: EditorialPreferencesPickerProps) {
  function toggleTopic(topic: EditorialTopic) {
    const nextTopics = preferences.selectedTopics.includes(topic)
      ? preferences.selectedTopics.filter((entry) => entry !== topic)
      : [...preferences.selectedTopics, topic];

    onChange({
      ...preferences,
      selectedTopics: nextTopics
    });
  }

  function toggleGenre(genre: EditorialGenre) {
    const nextGenres = preferences.selectedGenres.includes(genre)
      ? preferences.selectedGenres.filter((entry) => entry !== genre)
      : [...preferences.selectedGenres, genre].slice(0, 5);

    onChange({
      ...preferences,
      selectedGenres: nextGenres
    });
  }

  return (
    <div className={`editorial-picker ${compact ? "is-compact" : ""}`}>
      <div className="editorial-picker__section">
        <div className="editorial-picker__copy">
          <strong>Que queres ver en tu radar</strong>
          <p>Activa las capas editoriales que queres mezclar con tu feed social.</p>
        </div>

        <div className="editorial-picker__grid">
          {EDITORIAL_TOPIC_OPTIONS.map((option) => {
            const isActive = preferences.selectedTopics.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                className={`editorial-picker__card ${isActive ? "is-active" : ""}`}
                onClick={() => toggleTopic(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="editorial-picker__section">
        <div className="editorial-picker__copy">
          <strong>Generos opcionales</strong>
          <p>Sirven para afinar el radar cuando haya suficiente variedad en noticias.</p>
        </div>

        <div className="profile-editor__chips editorial-picker__chips">
          {EDITORIAL_GENRE_OPTIONS.map((option) => {
            const isActive = preferences.selectedGenres.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                className={`profile-editor__chip ${isActive ? "is-active" : ""}`}
                onClick={() => toggleGenre(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
