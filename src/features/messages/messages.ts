export type UserInfo = {
  name: string;
  age?: number;
  gender?: string;
}

export type Message = {
  role: string // "assistant" | "system" | "user";
  content?:
    | string
    | [{ type: 'text'; text: string }, { type: 'image'; image: string }] // マルチモーダル拡張
  audio?: { id: string }
  timestamp?: string
  userInfo?: UserInfo;
}

export type SaveableMessage = {
  role: string;
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    image?: string;
  }>;
  timestamp?: string;
  userInfo?: {
    name: string;
    age?: number;
    gender?: string;
  };
}

export const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed'] as const
export type EmotionType = (typeof EMOTIONS)[number]

export type Talk = {
  emotion: EmotionType
  message: string
  buffer?: ArrayBuffer
}

export const splitSentence = (text: string): string[] => {
  const splitMessages = text.split(/(?<=[。．！？\n])/g)
  return splitMessages.filter((msg) => msg !== '')
}
