import { Talk } from './messages'

export async function synthesizeVoiceIrodoriApi(
  talk: Talk,
  irodoriServerUrl: string,
  irodoriNoRef: boolean,
  irodoriRefWavPath?: string
): Promise<ArrayBuffer> {
  const formData = new FormData()
  formData.append('text', talk.message)
  formData.append('no_ref', irodoriNoRef.toString())

  if (talk.emotion) {
    // Optionally map emotion to caption if you want Voice Design
    // formData.append('caption', talk.emotion)
  }

  if (!irodoriNoRef && irodoriRefWavPath) {
    formData.append('ref_wav_path_str', irodoriRefWavPath)
  } else if (!irodoriNoRef) {
    // Safety check: if no ref is provided but no_ref is false,
    // we default to no_ref=true so the API doesn't crash.
    formData.set('no_ref', 'true')
  }

  const res = await fetch(irodoriServerUrl, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Irodori TTS API Error: ${res.status} ${errorText}`)
  }

  return await res.arrayBuffer()
}
