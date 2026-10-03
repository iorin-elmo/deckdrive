import type { CardDefinition } from './index.js';

export const poolCardDefinitions: readonly CardDefinition[] = [
  {
    id: 'sword_001',
    version: '1.0.0',
    name: '抜き打ち',
    description: '4ダメージ。このターンに剣を使っていなければ、追加で2ダメージ。',
    cost: 1,
    rarity: 'N',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '抜き打ち',
        description: '4ダメージ。このターンに剣を使っていなければ、追加で2ダメージ。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_001',
      },
    ],
  },
  {
    id: 'sword_002',
    version: '1.0.0',
    name: '返しの刃',
    description: '3ダメージ。ブロックを得ているなら、さらに3ダメージ。',
    cost: 1,
    rarity: 'N',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '返しの刃',
        description: '3ダメージ。ブロックを得ているなら、さらに3ダメージ。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_002',
      },
    ],
  },
  {
    id: 'sword_003',
    version: '1.0.0',
    name: '踏み込み',
    description: '6ダメージ。このターン終了時、自分のブロックを3失う。',
    cost: 1,
    rarity: 'N',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '踏み込み',
        description: '6ダメージ。このターン終了時、自分のブロックを3失う。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_003',
      },
    ],
  },
  {
    id: 'sword_004',
    version: '1.0.0',
    name: '二段斬り',
    description: '4ダメージを2回与える。',
    cost: 2,
    rarity: 'R',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '二段斬り',
        description: '4ダメージを2回与える。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_004',
      },
    ],
  },
  {
    id: 'sword_005',
    version: '1.0.0',
    name: '剣気',
    description: '5ブロックを得る。次に使う剣は3ダメージ増える。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '剣気',
        description: '5ブロックを得る。次に使う剣は3ダメージ増える。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_005',
      },
    ],
  },
  {
    id: 'sword_006',
    version: '1.0.0',
    name: '受け流し',
    description: '4ブロックを得る。次に受ける攻撃を防いだら、敵に4ダメージ。',
    cost: 1,
    rarity: 'R',
    type: 'REACTION',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '受け流し',
        description: '4ブロックを得る。次に受ける攻撃を防いだら、敵に4ダメージ。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_006',
      },
    ],
  },
  {
    id: 'sword_007',
    version: '1.0.0',
    name: '連刃の型',
    description:
      '使用前に剣カードを1枚以上使っていた場合に限り、この戦闘中、このカードより後に使う剣カードへ2ダメージを加える。このカード自身は使用前の枚数に含めない。',
    cost: 2,
    rarity: 'R',
    type: 'POWER',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '連刃の型',
        description:
          '使用前に剣カードを1枚以上使っていた場合に限り、この戦闘中、このカードより後に使う剣カードへ2ダメージを加える。このカード自身は使用前の枚数に含めない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_007',
      },
    ],
  },
  {
    id: 'sword_008',
    version: '1.0.0',
    name: '呼吸を整える',
    description: '1枚引く。手札に剣があれば1エネルギーを得る。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'SWORD',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '呼吸を整える',
        description: '1枚引く。手札に剣があれば1エネルギーを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_008',
      },
    ],
  },
  {
    id: 'sword_009',
    version: '1.0.0',
    name: '斬り上げ',
    description:
      '8ダメージ。敵のブロックがあるなら、そのブロックを半分（端数切り捨て）にしてからダメージを与える。',
    cost: 2,
    rarity: 'SR',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '斬り上げ',
        description:
          '8ダメージ。敵のブロックがあるなら、そのブロックを半分（端数切り捨て）にしてからダメージを与える。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_009',
      },
    ],
  },
  {
    id: 'sword_010',
    version: '1.0.0',
    name: '無明の太刀',
    description: '14ダメージ。このターン剣を2枚以上使っていれば、コストを2回復する。',
    cost: 3,
    rarity: 'SR',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '無明の太刀',
        description: '14ダメージ。このターン剣を2枚以上使っていれば、コストを2回復する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_010',
      },
    ],
  },
  {
    id: 'sword_011',
    version: '1.0.0',
    name: '剣聖の教え',
    description: 'この戦闘中、剣を使うたび1ブロックを得る。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '剣聖の教え',
        description: 'この戦闘中、剣を使うたび1ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_011',
      },
    ],
  },
  {
    id: 'sword_012',
    version: '1.0.0',
    name: '一閃',
    description: '4・3・3ダメージをこの順に与える（合計10）。各ヒットの前に敵のブロックを2減らす。',
    cost: 3,
    rarity: 'UR',
    type: 'ATTACK',
    class: 'SWORD',
    keywords: ['sword'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '一閃',
        description:
          '4・3・3ダメージをこの順に与える（合計10）。各ヒットの前に敵のブロックを2減らす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'sword_012',
      },
    ],
  },
  {
    id: 'guardian_001',
    version: '1.0.0',
    name: '盾構え',
    description: '6ブロックを得る。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '盾構え',
        description: '6ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_001',
      },
    ],
  },
  {
    id: 'guardian_002',
    version: '1.0.0',
    name: 'かばう',
    description: '4ブロックを得る。次に受ける攻撃のダメージをさらに2減らす。',
    cost: 1,
    rarity: 'N',
    type: 'REACTION',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: 'かばう',
        description: '4ブロックを得る。次に受ける攻撃のダメージをさらに2減らす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_002',
      },
    ],
  },
  {
    id: 'guardian_003',
    version: '1.0.0',
    name: '小休止',
    description: '3ブロックを得て、1枚引く。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '小休止',
        description: '3ブロックを得て、1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_003',
      },
    ],
  },
  {
    id: 'guardian_004',
    version: '1.0.0',
    name: '盾打ち',
    description: '4ダメージを与える。自分のブロック3ごとに、追加で1ダメージ。',
    cost: 1,
    rarity: 'R',
    type: 'ATTACK',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '盾打ち',
        description: '4ダメージを与える。自分のブロック3ごとに、追加で1ダメージ。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_004',
      },
    ],
  },
  {
    id: 'guardian_005',
    version: '1.0.0',
    name: '堅牢な陣',
    description: '11ブロックを得る。次の自分のターン開始時にブロックを4失う。',
    cost: 2,
    rarity: 'R',
    type: 'POWER',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '堅牢な陣',
        description: '11ブロックを得る。次の自分のターン開始時にブロックを4失う。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_005',
      },
    ],
  },
  {
    id: 'guardian_006',
    version: '1.0.0',
    name: '報復の構え',
    description:
      '次の敵ターン中に自分のブロックで実際に防いだダメージ量を記録する。その次の自分のターン開始時、毒ダメージ後かつ詠唱進行前に、記録量の半分（端数切り捨て）を敵へ与え、記録を0にする。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '報復の構え',
        description:
          '次の敵ターン中に自分のブロックで実際に防いだダメージ量を記録する。その次の自分のターン開始時、毒ダメージ後かつ詠唱進行前に、記録量の半分（端数切り捨て）を敵へ与え、記録を0にする。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_006',
      },
    ],
  },
  {
    id: 'guardian_007',
    version: '1.0.0',
    name: '盾の連携',
    description:
      'この戦闘中、ブロックを得る効果1回につき1度だけ1ブロックを追加で得る。追加分はこの効果を再誘発しない。',
    cost: 2,
    rarity: 'R',
    type: 'POWER',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '盾の連携',
        description:
          'この戦闘中、ブロックを得る効果1回につき1度だけ1ブロックを追加で得る。追加分はこの効果を再誘発しない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_007',
      },
    ],
  },
  {
    id: 'guardian_008',
    version: '1.0.0',
    name: '鉄壁',
    description: '15ブロックを得る。次の自分のターン開始時に1枚引く。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '鉄壁',
        description: '15ブロックを得る。次の自分のターン開始時に1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_008',
      },
    ],
  },
  {
    id: 'guardian_009',
    version: '1.0.0',
    name: '不屈の誓い',
    description: 'HPが半分以下なら8回復する。それ以外なら12ブロックを得る。',
    cost: 2,
    rarity: 'SR',
    type: 'SKILL',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '不屈の誓い',
        description: 'HPが半分以下なら8回復する。それ以外なら12ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_009',
      },
    ],
  },
  {
    id: 'guardian_010',
    version: '1.0.0',
    name: '砦の番人',
    description: 'この戦闘中、ターン終了時にブロックが残っていればカードを1枚引く。',
    cost: 3,
    rarity: 'SR',
    type: 'POWER',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '砦の番人',
        description: 'この戦闘中、ターン終了時にブロックが残っていればカードを1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_010',
      },
    ],
  },
  {
    id: 'guardian_011',
    version: '1.0.0',
    name: '難攻不落',
    description: '20ブロックを得る。次の敵ターンに受ける最初の攻撃を0にする。',
    cost: 3,
    rarity: 'UR',
    type: 'REACTION',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '難攻不落',
        description: '20ブロックを得る。次の敵ターンに受ける最初の攻撃を0にする。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_011',
      },
    ],
  },
  {
    id: 'guardian_012',
    version: '1.0.0',
    name: '最後の盾',
    description:
      '使用時に、次の相手ターン終了時まで自分がHP0以下になるダメージを受けるたびHPを1にする効果を登録する。ブロック等の適用後にHPが0以下になるダメージは、この効果の発動で実HPダメージを現在HP-1に切り詰め、超過分を防ぐ。HPが1なら実HPダメージは0となる。このカードは使用後に廃棄領域へ移す。',
    cost: 2,
    rarity: 'UR',
    type: 'REACTION',
    class: 'GUARDIAN',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '最後の盾',
        description:
          '使用時に、次の相手ターン終了時まで自分がHP0以下になるダメージを受けるたびHPを1にする効果を登録する。ブロック等の適用後にHPが0以下になるダメージは、この効果の発動で実HPダメージを現在HP-1に切り詰め、超過分を防ぐ。HPが1なら実HPダメージは0となる。このカードは使用後に廃棄領域へ移す。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'guardian_012',
      },
    ],
  },
  {
    id: 'mage_001',
    version: '1.0.0',
    name: '火花',
    description: '5ダメージ。',
    cost: 1,
    rarity: 'N',
    type: 'ATTACK',
    class: 'MAGE',
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '火花',
        description: '5ダメージ。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_001',
      },
    ],
  },
  {
    id: 'mage_002',
    version: '1.0.0',
    name: '氷片',
    description: '3ダメージを与え、敵の次の攻撃を2減らす。',
    cost: 1,
    rarity: 'N',
    type: 'REACTION',
    class: 'MAGE',
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '氷片',
        description: '3ダメージを与え、敵の次の攻撃を2減らす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_002',
      },
    ],
  },
  {
    id: 'mage_003',
    version: '1.0.0',
    name: '魔力充填',
    description: '1エネルギーを得る。次に使う魔法は2ダメージ増える。',
    cost: 1,
    rarity: 'N',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔力充填',
        description: '1エネルギーを得る。次に使う魔法は2ダメージ増える。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_003',
      },
    ],
  },
  {
    id: 'mage_007',
    version: '1.0.0',
    name: '凍結の呪文',
    description:
      '6ダメージ。敵に「次のターン、最初のカードのコスト+1」を付与する。[新規：状態異常]',
    cost: 2,
    rarity: 'R',
    type: 'REACTION',
    class: 'MAGE',
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '凍結の呪文',
        description:
          '6ダメージ。敵に「次のターン、最初のカードのコスト+1」を付与する。[新規：状態異常]',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_007',
      },
    ],
  },
  {
    id: 'mage_008',
    version: '1.0.0',
    name: '魔導書・連鎖',
    description:
      'この戦闘中、魔法カードの効果と詠唱開始を解決した後、次に使う魔法カードが開始する詠唱を1短縮する。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔導書・連鎖',
        description:
          'この戦闘中、魔法カードの効果と詠唱開始を解決した後、次に使う魔法カードが開始する詠唱を1短縮する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_008',
      },
    ],
  },
  {
    id: 'mage_011',
    version: '1.0.0',
    name: '魔導書・黒',
    description:
      'この戦闘中、魔法のダメージ効果は追加でもう1回発動する。追加発動分はこの効果を再誘発しない。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔導書・黒',
        description:
          'この戦闘中、魔法のダメージ効果は追加でもう1回発動する。追加発動分はこの効果を再誘発しない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_011',
      },
    ],
  },
  {
    id: 'mage_012',
    version: '1.0.0',
    name: '魔導書・白',
    description: 'この戦闘中、魔法の効果が発動するたび2回復する（ターン1回）。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔導書・白',
        description: 'この戦闘中、魔法の効果が発動するたび2回復する（ターン1回）。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_012',
      },
    ],
  },
  {
    id: 'mage_013',
    version: '1.0.0',
    name: '魔導書・赤',
    description: 'この戦闘中、魔法は敵のブロックを無視する。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔導書・赤',
        description: 'この戦闘中、魔法は敵のブロックを無視する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_013',
      },
    ],
  },
  {
    id: 'mage_014',
    version: '1.0.0',
    name: '魔導書・青',
    description: 'この戦闘中、魔法の効果が発動するたび1枚引く（ターン1回）。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'MAGE',
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '魔導書・青',
        description: 'この戦闘中、魔法の効果が発動するたび1枚引く（ターン1回）。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'mage_014',
      },
    ],
  },
  {
    id: 'alchemist_010',
    version: '1.0.0',
    name: '賢者の触媒',
    description:
      '次に行う合成では、素材を選ぶ前に山札が空なら通常の山札補充規則を適用し、一番上を1枚公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。素材なら直後に `CARD_MOVED`（`visibility: allPlayers`）で手札へ移す。素材でなければ位置を変えず何も加えない。補充後も山札が空なら何もしない。完成品のコストは変わらない。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'ALCHEMIST',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '賢者の触媒',
        description:
          '次に行う合成では、素材を選ぶ前に山札が空なら通常の山札補充規則を適用し、一番上を1枚公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。素材なら直後に `CARD_MOVED`（`visibility: allPlayers`）で手札へ移す。素材でなければ位置を変えず何も加えない。補充後も山札が空なら何もしない。完成品のコストは変わらない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'alchemist_010',
      },
    ],
  },
  {
    id: 'alchemist_012',
    version: '1.0.0',
    name: '賢者の触媒核',
    description:
      'この戦闘中、素材を合成するたび1エネルギーを得る（ターン1回）。エネルギー獲得に上限は設けない。',
    cost: 3,
    rarity: 'UR',
    type: 'POWER',
    class: 'ALCHEMIST',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '賢者の触媒核',
        description:
          'この戦闘中、素材を合成するたび1エネルギーを得る（ターン1回）。エネルギー獲得に上限は設けない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'alchemist_012',
      },
    ],
  },
  {
    id: 'hunter_001',
    version: '1.0.0',
    name: '狩人の弓',
    description: '3ブロックを得て、矢を1枚装填する。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '狩人の弓',
        description: '3ブロックを得て、矢を1枚装填する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_001',
      },
    ],
  },
  {
    id: 'hunter_002',
    version: '1.0.0',
    name: '矢継ぎ',
    description:
      '山札が空なら通常の山札補充規則を先に適用する。山札を所有者にだけ公開して検索し、検索で確認した各カードを、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` で記録する。矢1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。矢が見つからなければ何も手札へ移さない。検索後、山札にカードが残っていれば `DECK_SHUFFLED`（`reason: HUNTER_ARROW_SEARCH`）で切り直す。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '矢継ぎ',
        description:
          '山札が空なら通常の山札補充規則を先に適用する。山札を所有者にだけ公開して検索し、検索で確認した各カードを、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` で記録する。矢1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。矢が見つからなければ何も手札へ移さない。検索後、山札にカードが残っていれば `DECK_SHUFFLED`（`reason: HUNTER_ARROW_SEARCH`）で切り直す。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_002',
      },
    ],
  },
  {
    id: 'hunter_003',
    version: '1.0.0',
    name: '毒矢',
    description: '4ダメージを与え、毒2を付与する。状態異常案。',
    cost: 1,
    rarity: 'N',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: ['arrow'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '毒矢',
        description: '4ダメージを与え、毒2を付与する。状態異常案。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_003',
      },
    ],
  },
  {
    id: 'hunter_004',
    version: '1.0.0',
    name: '速射',
    description: '装填キューの先頭2本を発射する。各矢のダメージは-1。',
    cost: 1,
    rarity: 'R',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '速射',
        description: '装填キューの先頭2本を発射する。各矢のダメージは-1。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_004',
      },
    ],
  },
  {
    id: 'hunter_005',
    version: '1.0.0',
    name: '貫通矢',
    description: '6ダメージ。敵のブロックを無視する。',
    cost: 2,
    rarity: 'R',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: ['arrow'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '貫通矢',
        description: '6ダメージ。敵のブロックを無視する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_005',
      },
    ],
  },
  {
    id: 'hunter_006',
    version: '1.0.0',
    name: '目印の矢',
    description: '3ダメージ。次に受ける攻撃ダメージを4増やす。',
    cost: 1,
    rarity: 'R',
    type: 'REACTION',
    class: 'HUNTER',
    keywords: ['arrow'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '目印の矢',
        description: '3ダメージ。次に受ける攻撃ダメージを4増やす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_006',
      },
    ],
  },
  {
    id: 'hunter_007',
    version: '1.0.0',
    name: '仕込み罠',
    description: '次に敵が攻撃したとき、6ダメージを与えてその攻撃を3減らす。',
    cost: 1,
    rarity: 'R',
    type: 'REACTION',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '仕込み罠',
        description: '次に敵が攻撃したとき、6ダメージを与えてその攻撃を3減らす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_007',
      },
    ],
  },
  {
    id: 'hunter_008',
    version: '1.0.0',
    name: '矢羽の改良',
    description: '装填中の矢1本を `cardInstanceId` で選ぶ。その矢はこの戦闘中2ダメージ増える。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '矢羽の改良',
        description: '装填中の矢1本を `cardInstanceId` で選ぶ。その矢はこの戦闘中2ダメージ増える。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_008',
      },
    ],
  },
  {
    id: 'hunter_009',
    version: '1.0.0',
    name: '連装弓',
    description:
      '3ブロックを得て、矢を最大3枚装填する。選択順にコストを支払い、エネルギーが足りない矢は装填せずに残す。',
    cost: 2,
    rarity: 'SR',
    type: 'SKILL',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '連装弓',
        description:
          '3ブロックを得て、矢を最大3枚装填する。選択順にコストを支払い、エネルギーが足りない矢は装填せずに残す。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_009',
      },
    ],
  },
  {
    id: 'hunter_010',
    version: '1.0.0',
    name: '追跡者',
    description: '装填キューの矢をすべて発射する。発射した矢1本につき2ブロックを得る。',
    cost: 2,
    rarity: 'SR',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '追跡者',
        description: '装填キューの矢をすべて発射する。発射した矢1本につき2ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_010',
      },
    ],
  },
  {
    id: 'hunter_011',
    version: '1.0.0',
    name: '星穿ち',
    description:
      '装填キューから発射したとき10ダメージ。ダメージ解決後、戦闘が継続していれば、ロック中の自身だけを仮想的に除いたキューが3本以上あるか判定する。成立時は追加発射を1回予約する。自身の `ARROW_REMOVED`、`CARD_DISCARDED` をこの順で記録した後に予約を実行し、残ったキューの先頭1本を通常発射する。仮想除外ではstateを変更せずイベントも出さない。終端成立時は追加発射しない。',
    cost: 3,
    rarity: 'SR',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: ['arrow'],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '星穿ち',
        description:
          '装填キューから発射したとき10ダメージ。ダメージ解決後、戦闘が継続していれば、ロック中の自身だけを仮想的に除いたキューが3本以上あるか判定する。成立時は追加発射を1回予約する。自身の `ARROW_REMOVED`、`CARD_DISCARDED` をこの順で記録した後に予約を実行し、残ったキューの先頭1本を通常発射する。仮想除外ではstateを変更せずイベントも出さない。終端成立時は追加発射しない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_011',
      },
    ],
  },
  {
    id: 'hunter_012',
    version: '1.0.0',
    name: '百矢の雨',
    description:
      '解決開始時のarrowQueueを順序付きID列としてsnapshotする。snapshot内の矢を通常発射順にすべて解決する。星穿ちなどによる追加発射は通常発射として解決し、既に発射済みのsnapshot項目は再度通常発射しない。snapshotにない矢は追加発射・再発動に含めない。通常発射が全て終わった後、snapshot内で発射された各矢の効果だけをsnapshot順に `ARROW_REPEATED` で1回ずつ再解決する。再解決は矢をキューから発射・除去せず、星穿ちの追加発射など他の矢発射triggerを誘発しない。追加コストやカード領域の移動は行わない。',
    cost: 3,
    rarity: 'UR',
    type: 'ATTACK',
    class: 'HUNTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '百矢の雨',
        description:
          '解決開始時のarrowQueueを順序付きID列としてsnapshotする。snapshot内の矢を通常発射順にすべて解決する。星穿ちなどによる追加発射は通常発射として解決し、既に発射済みのsnapshot項目は再度通常発射しない。snapshotにない矢は追加発射・再発動に含めない。通常発射が全て終わった後、snapshot内で発射された各矢の効果だけをsnapshot順に `ARROW_REPEATED` で1回ずつ再解決する。再解決は矢をキューから発射・除去せず、星穿ちの追加発射など他の矢発射triggerを誘発しない。追加コストやカード領域の移動は行わない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'hunter_012',
      },
    ],
  },
  {
    id: 'trickster_001',
    version: '1.0.0',
    name: '早業',
    description:
      '手札1枚を山札の一番下に置き、1枚引く。移動は `CARD_MOVED` に記録する。山札から引く処理には山札補充規則を適用する。',
    cost: 0,
    rarity: 'N',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '早業',
        description:
          '手札1枚を山札の一番下に置き、1枚引く。移動は `CARD_MOVED` に記録する。山札から引く処理には山札補充規則を適用する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_001',
      },
    ],
  },
  {
    id: 'trickster_002',
    version: '1.0.0',
    name: '袖の一枚',
    description: '1枚引く。引いたカードがコスト1以下なら1ブロックを得る。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '袖の一枚',
        description: '1枚引く。引いたカードがコスト1以下なら1ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_002',
      },
    ],
  },
  {
    id: 'trickster_003',
    version: '1.0.0',
    name: '目くらまし',
    description: '3ダメージを与える。敵の次の攻撃を2減らす。',
    cost: 1,
    rarity: 'N',
    type: 'REACTION',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '目くらまし',
        description: '3ダメージを与える。敵の次の攻撃を2減らす。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_003',
      },
    ],
  },
  {
    id: 'trickster_004',
    version: '1.0.0',
    name: 'すり替え',
    description: '手札1枚を捨て、山札から2枚引く。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: 'すり替え',
        description: '手札1枚を捨て、山札から2枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_004',
      },
    ],
  },
  {
    id: 'trickster_005',
    version: '1.0.0',
    name: '予告状',
    description: '敵の次のターン開始時、敵は2ダメージを受ける。自分は1枚引く。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '予告状',
        description: '敵の次のターン開始時、敵は2ダメージを受ける。自分は1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_005',
      },
    ],
  },
  {
    id: 'trickster_006',
    version: '1.0.0',
    name: '逃げ足',
    description:
      '5ブロックを得る。使用時にarrowQueueに含まれない手札1枚を選ぶ。このターン終了時にそのカードが手札にあり、かつ `arrowQueue` に含まれない場合だけ `CARD_MOVED` で山札の一番上へ移す。選択後に装填された場合は移動せず失効する。移動先のカードIDは `PLAY_CARD.choices` の `CARD_INSTANCES.cardInstanceIds` に記録する。',
    cost: 1,
    rarity: 'R',
    type: 'POWER',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '逃げ足',
        description:
          '5ブロックを得る。使用時にarrowQueueに含まれない手札1枚を選ぶ。このターン終了時にそのカードが手札にあり、かつ `arrowQueue` に含まれない場合だけ `CARD_MOVED` で山札の一番上へ移す。選択後に装填された場合は移動せず失効する。移動先のカードIDは `PLAY_CARD.choices` の `CARD_INSTANCES.cardInstanceIds` に記録する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_006',
      },
    ],
  },
  {
    id: 'trickster_007',
    version: '1.0.0',
    name: '偽の切り札',
    description:
      '手札からカード1枚のコピーを作り、手札に加える。コピーはターン終了時に廃棄される。',
    cost: 2,
    rarity: 'R',
    type: 'POWER',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '偽の切り札',
        description:
          '手札からカード1枚のコピーを作り、手札に加える。コピーはターン終了時に廃棄される。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_007',
      },
    ],
  },
  {
    id: 'trickster_008',
    version: '1.0.0',
    name: '仕込み直し',
    description: '捨て札からカード1枚を選び、`CARD_MOVED` で山札の一番上に置く。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '仕込み直し',
        description: '捨て札からカード1枚を選び、`CARD_MOVED` で山札の一番上に置く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_008',
      },
    ],
  },
  {
    id: 'trickster_009',
    version: '1.0.0',
    name: '時間泥棒',
    description: '6ダメージ。敵が次にカードを使うたび、そのコストを1増やす（最大2回）。',
    cost: 2,
    rarity: 'SR',
    type: 'REACTION',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '時間泥棒',
        description: '6ダメージ。敵が次にカードを使うたび、そのコストを1増やす（最大2回）。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_009',
      },
    ],
  },
  {
    id: 'trickster_010',
    version: '1.0.0',
    name: '手品師の袖',
    description:
      '3枚引く。ドロー完了後の手札全体を候補として所有者だけに `CARD_CHOICE_REQUESTED` を送り、`PENDING_CARD_CHOICE` で停止する。`SUBMIT_CARD_CHOICE` の `CARD` 選択で1枚を選び、そのコストをこのターン中0にする。候補が0枚なら選択要求を作らず、コスト固定を行わない。',
    cost: 2,
    rarity: 'SR',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '手品師の袖',
        description:
          '3枚引く。ドロー完了後の手札全体を候補として所有者だけに `CARD_CHOICE_REQUESTED` を送り、`PENDING_CARD_CHOICE` で停止する。`SUBMIT_CARD_CHOICE` の `CARD` 選択で1枚を選び、そのコストをこのターン中0にする。候補が0枚なら選択要求を作らず、コスト固定を行わない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_010',
      },
    ],
  },
  {
    id: 'trickster_011',
    version: '1.0.0',
    name: '予定変更',
    description: 'このターン、カードを引くたび1ブロックを得る。ターン終了時に2ダメージを受ける。',
    cost: 1,
    rarity: 'SR',
    type: 'POWER',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '予定変更',
        description:
          'このターン、カードを引くたび1ブロックを得る。ターン終了時に2ダメージを受ける。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_011',
      },
    ],
  },
  {
    id: 'trickster_012',
    version: '1.0.0',
    name: '大脱出',
    description:
      '解決時の手札枚数と手札順を記録する。手札中の装填済み矢をarrowQueueの順で `ARROW_REMOVED`（`visibility: ownerOnly`）に記録してキューから除き、その後、手札順に全カードを `CARD_MOVED`（`visibility: ownerOnly`）で山札へ戻す。山札を `DECK_SHUFFLED`（`reason: TRICKSTER_ESCAPE`）で切り直して記録した枚数を引き、引いたカード1枚につき2ブロックを得る。切り直し後のID順は山札所有者以外に公開しない。',
    cost: 3,
    rarity: 'UR',
    type: 'SKILL',
    class: 'TRICKSTER',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '大脱出',
        description:
          '解決時の手札枚数と手札順を記録する。手札中の装填済み矢をarrowQueueの順で `ARROW_REMOVED`（`visibility: ownerOnly`）に記録してキューから除き、その後、手札順に全カードを `CARD_MOVED`（`visibility: ownerOnly`）で山札へ戻す。山札を `DECK_SHUFFLED`（`reason: TRICKSTER_ESCAPE`）で切り直して記録した枚数を引き、引いたカード1枚につき2ブロックを得る。切り直し後のID順は山札所有者以外に公開しない。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'trickster_012',
      },
    ],
  },
  {
    id: 'neutral_001',
    version: '1.0.0',
    name: '応急手当',
    description: '4回復。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '応急手当',
        description: '4回復。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_001',
      },
    ],
  },
  {
    id: 'neutral_002',
    version: '1.0.0',
    name: '整理整頓',
    description: '手札1枚を捨て、1枚引く。',
    cost: 0,
    rarity: 'N',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '整理整頓',
        description: '手札1枚を捨て、1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_002',
      },
    ],
  },
  {
    id: 'neutral_003',
    version: '1.0.0',
    name: '旅人の護符',
    description: '5ブロックを得る。',
    cost: 1,
    rarity: 'N',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '旅人の護符',
        description: '5ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_003',
      },
    ],
  },
  {
    id: 'neutral_004',
    version: '1.0.0',
    name: '戦術の確認',
    description:
      '山札が空なら通常の山札補充規則を先に適用する。山札の上から最大3枚（`min(3, 山札枚数)`）を所有者にだけ見せ、上から順にindex 0から、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` として記録する。見られるカードが0枚なら何もしない。1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。残りのカードは元の相対順を保って山札の下へ移し、各移動を同じ `visibility` の `CARD_MOVED` に記録する。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。選択IDはaction/replayでは所有者だけに見せる。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '戦術の確認',
        description:
          '山札が空なら通常の山札補充規則を先に適用する。山札の上から最大3枚（`min(3, 山札枚数)`）を所有者にだけ見せ、上から順にindex 0から、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` として記録する。見られるカードが0枚なら何もしない。1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。残りのカードは元の相対順を保って山札の下へ移し、各移動を同じ `visibility` の `CARD_MOVED` に記録する。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。選択IDはaction/replayでは所有者だけに見せる。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_004',
      },
    ],
  },
  {
    id: 'neutral_005',
    version: '1.0.0',
    name: '予備の食料',
    description: '3回復。手札が2枚以下なら、さらに1枚引く。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '予備の食料',
        description: '3回復。手札が2枚以下なら、さらに1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_005',
      },
    ],
  },
  {
    id: 'neutral_006',
    version: '1.0.0',
    name: '古びた羅針盤',
    description:
      '山札の上からカードを1枚全員に公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。そのカードのコスト分ブロックを得る（最大6）。',
    cost: 1,
    rarity: 'R',
    type: 'SKILL',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '古びた羅針盤',
        description:
          '山札の上からカードを1枚全員に公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。そのカードのコスト分ブロックを得る（最大6）。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_006',
      },
    ],
  },
  {
    id: 'neutral_007',
    version: '1.0.0',
    name: '休息の心得',
    description: '6回復。次の自分のターン開始時、5ブロックを得る。',
    cost: 2,
    rarity: 'SR',
    type: 'POWER',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '休息の心得',
        description: '6回復。次の自分のターン開始時、5ブロックを得る。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_007',
      },
    ],
  },
  {
    id: 'neutral_008',
    version: '1.0.0',
    name: '追い風',
    description:
      'このカードを使った後、同じターンに最初に使うカードのコストを1下げる。割引用pendingEffectが未消費のまま同ターンの `TURN_ENDED` を迎えた場合、その項目を消費して1枚引く。',
    cost: 1,
    rarity: 'SR',
    type: 'POWER',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '追い風',
        description:
          'このカードを使った後、同じターンに最初に使うカードのコストを1下げる。割引用pendingEffectが未消費のまま同ターンの `TURN_ENDED` を迎えた場合、その項目を消費して1枚引く。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_008',
      },
    ],
  },
  {
    id: 'neutral_009',
    version: '1.0.0',
    name: '英雄の意志',
    description: 'HPが10以下なら、HPを10にして敵に10ダメージ。それ以外なら8回復する。',
    cost: 3,
    rarity: 'UR',
    type: 'ATTACK',
    class: 'NEUTRAL',
    keywords: [],
    artwork: null,
    deckLimit: 3,
    translations: {
      ja: {
        name: '英雄の意志',
        description: 'HPが10以下なら、HPを10にして敵に10ダメージ。それ以外なら8回復する。',
      },
    },
    effects: [
      {
        type: 'POOL_CARD',
        cardId: 'neutral_009',
      },
    ],
  },
];
