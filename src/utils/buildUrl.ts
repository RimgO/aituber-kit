import getConfig from 'next/config'

/**
 * github pagesに公開時にアセットを読み込めるようにするため、
 * 環境変数を見てURLにリポジトリ名を追加する
 */
export function buildUrl(path: string): string {
  const config = getConfig() || {}
  const publicRuntimeConfig = config.publicRuntimeConfig || {}
  const root =
    typeof publicRuntimeConfig.root === 'string' ? publicRuntimeConfig.root : ''

  // 空白などの特殊文字を含むパスを適切にエンコード
  // ただし、パス区切り文字（/）はエンコードしない
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return root + encodedPath
}
