import type { GameLanguage, GameMode, GameText, RoomSettings } from '../../../shared/types.js'
import { hashString } from '../utils/id.js'

const ENGLISH_WORDS = (
  'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are had has been were being been when where why how much many some any each few both those these same such with without against between through during before after above below up down out off over under again further once here there all any both each few more most other some such no nor not only own same so than too very just don now right left good bad great small large long short high low young old big little next early late easy hard fast slow true false full empty near far open close together alone never always often sometimes usually rarely always else every nothing anything something everything nothing nobody somebody everybody anybody no one everyone no one someone anyone everyone each other one another myself yourself himself herself itself ourselves yourselves themselves what which who whom whose this that these those then than so such both all any both'.split(
    ' ',
  )
)

const SPANISH_WORDS = (
  'el la los las de del que y o a al en un una unos unas por para con sin sobre entre hacia desde antes después durante hasta contra según pero sino porque aunque si no sí ya también muy poco mucho más menos todo toda todos todas nada algo alguien ninguno cada otro otra otros otras mismo misma mismos mismas este esta estos estas ese esa esos esas aquel aquella aquellos aquellas mi tu su nuestro vuestra mis tus sus soy eres es somos sois son estaba estaba estábamos estaban he has ha hemos habéis han tengo tienes tiene tenemos tenéis tienen hago haces hace hacemos hacéis hacen puedo puedes puede podemos podéis pueden quiero quieres quiere queremos queréis quieren vamos vais va van venimos venís vienen digo dices dice decimos decís dicen sé sabes sabe sabemos sabéis saben creo crees cree creemos creéis creen pienso piensas piensa pensamos pensáis piensan como comes come comemos coméis comen'.split(
    ' ',
  )
)

const FRENCH_WORDS = (
  'le la les un une des et ou mais donc or ni car pour par avec sans sous sur dans entre avant après pendant depuis contre selon chez vers dès jusqu cela ce cette ces celui celle ceux celles je tu il elle nous vous ils elles on mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs être avoir faire dire aller voir savoir pouvoir vouloir venir devoir falloir mettre donner passer trouver rester partir arriver sembler devenir entendre mourir demander rendre tenir porter répondre'.split(
    ' ',
  )
)

const GERMAN_WORDS = (
  'der die das den dem des ein eine einen einem einer ein ihr seine sein ihrer seinem seinen seine unser unseres unsere unseren ihrer ihren das dass weil wenn als ob aber und oder denn doch schon noch nur auch sehr nicht kein keine keiner keinen keinem nichts jemand niemand alle alles jeder jede jedes einige wenige viele man jemand nichts etwas immer nie oft selten meistens gern heute morgen gestern jetzt dann bald später früher hier dort oben unten links rechts vorne hinten'.split(
    ' ',
  )
)

const WORD_LISTS: Record<GameLanguage, readonly string[]> = {
  english: ENGLISH_WORDS,
  spanish: SPANISH_WORDS,
  french: FRENCH_WORDS,
  german: GERMAN_WORDS,
}

const QUOTES: Record<GameLanguage, readonly string[]> = {
  english: [
    'The only way to do great work is to love what you do. Stay hungry, stay foolish.',
    'In the middle of difficulty lies opportunity. The future belongs to those who believe in the beauty of their dreams.',
    'Success is not final, failure is not fatal. It is the courage to continue that counts.',
    'The mind is everything. What you think you become. Peace comes from within. Do not dwell in the past.',
    'Quality is not an act, it is a habit. The best way to predict the future is to create it.',
    'It does not matter how slowly you go as long as you do not stop. Believe you can and you are halfway there.',
  ],
  spanish: [
    'La práctica hace al maestro. No dejes para mañana lo que puedas hacer hoy.',
    'El éxito es la suma de pequeños esfuerzos repetidos día tras día.',
    'El que persevera alcanza. Cada día es una nueva oportunidad para mejorar.',
  ],
  french: [
    'La pratique rend parfait. Chaque jour est une nouvelle occasion de progresser.',
    'Le succès est la somme de petits efforts répétés jour après jour.',
    'Qui veut aller loin ménage sa monture. Rien ne sert de courir, il faut partir à point.',
  ],
  german: [
    'Übung macht den Meister. Jeder Tag ist eine neue Chance, besser zu werden.',
    'Erfolg ist die Summe kleiner Anstrengungen, die Tag für Tag wiederholt werden.',
    'Wer nicht wagt, der nicht gewinnt. Gut Ding will Weile haben.',
  ],
}

const MIN_WORDS_FOR_TIME_MODE = 30

export interface TextServiceDeps {
  random?: () => number
}

/**
 * Authoritative text generation. The server generates the text once per game
 * and every player receives the exact same payload; clients never generate
 * or modify it.
 */
export class TextService {
  private readonly random: () => number

  constructor(deps: TextServiceDeps = {}) {
    this.random = deps.random ?? Math.random
  }

  pick<T>(items: readonly T[]): T {
    const idx = Math.floor(this.random() * items.length)
    return items[Math.min(idx, items.length - 1)] as T
  }

  private wordPool(language: GameLanguage): readonly string[] {
    return WORD_LISTS[language] ?? WORD_LISTS.english
  }

  generateText(settings: RoomSettings): GameText {
    const mode = settings.mode
    if (mode === 'quote') {
      const quote = this.pick(QUOTES[settings.language] ?? QUOTES.english)
      return this.build(quote.split(/\s+/), mode)
    }
    const count = mode === 'words' ? settings.wordCount : Math.max(MIN_WORDS_FOR_TIME_MODE, settings.duration * 7)
    const pool = this.wordPool(settings.language)
    const words: string[] = []
    for (let i = 0; i < count; i++) {
      words.push(this.pick(pool))
    }
    return this.build(words, mode)
  }

  private build(words: string[], mode: GameMode): GameText {
    const raw = words.join(' ')
    return { words, raw, hash: hashString(raw), mode }
  }
}
