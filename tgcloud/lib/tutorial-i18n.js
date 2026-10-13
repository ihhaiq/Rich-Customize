import { resolveLanguage } from 'lib/i18n';
import de from 'lib/lang/tutorial/de';
import es from 'lib/lang/tutorial/es';
import hi from 'lib/lang/tutorial/hi';
import id from 'lib/lang/tutorial/id';
import it from 'lib/lang/tutorial/it';
import ja from 'lib/lang/tutorial/ja';
import ko from 'lib/lang/tutorial/ko';
import nl from 'lib/lang/tutorial/nl';
import pl from 'lib/lang/tutorial/pl';
import pt from 'lib/lang/tutorial/pt';
import ru from 'lib/lang/tutorial/ru';
import th from 'lib/lang/tutorial/th';
import tr from 'lib/lang/tutorial/tr';
import uk from 'lib/lang/tutorial/uk';
import ur from 'lib/lang/tutorial/ur';
import vi from 'lib/lang/tutorial/vi';
import zh_hans from 'lib/lang/tutorial/zh-hans';
import zh_hant from 'lib/lang/tutorial/zh-hant';

export const TUTORIAL_TRANSLATIONS = Object.freeze({
  'de': de,
  'es': es,
  'hi': hi,
  'id': id,
  'it': it,
  'ja': ja,
  'ko': ko,
  'nl': nl,
  'pl': pl,
  'pt': pt,
  'ru': ru,
  'th': th,
  'tr': tr,
  'uk': uk,
  'ur': ur,
  'vi': vi,
  'zh-hans': zh_hans,
  'zh-hant': zh_hant,
});

export function tutorialWords(locale, ar, en) {
  const language = resolveLanguage(locale);
  if (language === 'ar') return ar;
  return TUTORIAL_TRANSLATIONS[language]?.[en] ?? en;
}
