import { buildUrl } from '@/utils/buildUrl'
import Head from 'next/head'
export const Meta = () => {
  const title = 'Parent Voice Generator'
  const description =
    '親の声をAIで再現し、3Dアバターを通じて子供と会話・読み聞かせができるアプリです。'
  const imageUrl = '/ogp.png'
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
    </Head>
  )
}
