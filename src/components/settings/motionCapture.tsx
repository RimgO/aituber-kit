import { useTranslation } from 'react-i18next'
import settingsStore from '@/features/stores/settings'
import { TextButton } from '../textButton'
import { useCallback } from 'react'
import Image from 'next/image'

const MotionCapture = () => {
  const { t } = useTranslation()
  const enableMotionCapture = settingsStore((s) => s.enableMotionCapture)
  const enableFaceTracking = settingsStore((s) => s.enableFaceTracking)
  const enableHandTracking = settingsStore((s) => s.enableHandTracking)
  const enableFingerTracking = settingsStore((s) => s.enableFingerTracking)
  const enableUpperBodyTracking = settingsStore(
    (s) => s.enableUpperBodyTracking
  )
  const enableHipsTracking = settingsStore((s) => s.enableHipsTracking)
  const enableLegTracking = settingsStore((s) => s.enableLegTracking)
  const showDebugSkeleton = settingsStore((s) => s.showDebugSkeleton)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center mb-6">
        {/* Using a generic icon or similar if available */}
        <h2 className="text-2xl font-bold">{t('MotionCaptureSettings')}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableMotionCapture')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableMotionCapture: !enableMotionCapture,
              })
            }
          >
            {enableMotionCapture ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableFaceTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableFaceTracking: !enableFaceTracking,
              })
            }
          >
            {enableFaceTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableHandTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableHandTracking: !enableHandTracking,
              })
            }
          >
            {enableHandTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableFingerTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableFingerTracking: !enableFingerTracking,
              })
            }
          >
            {enableFingerTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableUpperBodyTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableUpperBodyTracking: !enableUpperBodyTracking,
              })
            }
          >
            {enableUpperBodyTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableHipsTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({
                enableHipsTracking: !enableHipsTracking,
              })
            }
          >
            {enableHipsTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">{t('EnableLegTracking')}</div>
          <TextButton
            onClick={() =>
              settingsStore.setState({ enableLegTracking: !enableLegTracking })
            }
          >
            {enableLegTracking ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>

        <div className="mb-4">
          <div className="mb-2 font-bold">
            {t('ShowDebugSkeleton') ||
              'デバッグスケルトン表示 (Debug Skeleton)'}
          </div>
          <TextButton
            onClick={() =>
              settingsStore.setState({ showDebugSkeleton: !showDebugSkeleton })
            }
          >
            {showDebugSkeleton ? t('StatusOn') : t('StatusOff')}
          </TextButton>
        </div>
      </div>
    </div>
  )
}

export default MotionCapture
