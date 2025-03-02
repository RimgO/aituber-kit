import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MessageInputContainer } from './messageInputContainer'

import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { IconButton } from './iconButton'

// API client functions を修正
const fetchImageInfo = async () => {
  try {
    const response = await fetch('http://127.0.0.1:8000/data/', {
      method: 'GET',
      mode: "cors", // no-cors, *cors, same-origin
      cache: "default", // *default, no-cache, reload, force-cache, only-if-cached
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include',  // CORS用のクレデンシャル設定
    });
    // JSONとしてパース
    const jsonData = await response.json();
    return jsonData;    
  } catch (err) {
    console.error('Failed to fetch info:', err);
    return null;
  }
};

const fetchImageFile = async () => {
  try {
    const response = await fetch('http://127.0.0.1:8000/file/', {
      method: 'GET',
      mode: "cors", // no-cors, *cors, same-origin
      cache: "default", // *default, no-cache, reload, force-cache, only-if-cached
      headers: {
        'Accept': 'image/png',  // JSONではなくPNG形式を要求
      },
      credentials: 'include',
    });
    const blob = await response.blob(); // Blobとして取得
    return URL.createObjectURL(blob); // URLオブジェクトに変換
  } catch (err) {
    console.error('Failed to fetch image file:', err);
    return null;
  }
};

export const Webcam = () => {
  const triggerShutter = homeStore((s) => s.triggerShutter)
  const useVideoAsBackground = settingsStore((s) => s.useVideoAsBackground)
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [showRotateButton, setShowRotateButton] = useState(true)
  const [showWebcam, setShowWebcam] = useState(true)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null)
  const backgroundVideoRef = useRef<HTMLVideoElement>(null)
  const [currentTranscript, setCurrentTranscript] = useState('')

  // 状態の追加
  const [apiData, setApiData] = useState({
    imageUrl: '',
    timestamp: '',
    age: '',
    gender: '',
    mood: '',
    recognizestate: '',
    recognizedname: ''
  });

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices) return
    try {
      const latestDevices = (
        await navigator.mediaDevices.enumerateDevices()
      ).filter((d) => d.kind === 'videoinput')
      setDevices(latestDevices)
      setShowRotateButton(latestDevices.length > 1)
      if (latestDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(latestDevices[0].deviceId)
      }
    } catch (error) {
      console.error('Error refreshing devices:', error)
    }
  }, [selectedDevice])

  useEffect(() => {
    refreshDevices()
    const handleDeviceChange = () => {
      refreshDevices()
    }
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices?.removeEventListener(
        'devicechange',
        handleDeviceChange
      )
    }
  }, [refreshDevices])

  useEffect(() => {
    if (useVideoAsBackground && videoRef.current?.srcObject) {
      if (backgroundVideoRef.current) {
        backgroundVideoRef.current.srcObject = videoRef.current.srcObject
      }
    } else if (!useVideoAsBackground) {
      if (backgroundVideoRef.current) {
        backgroundVideoRef.current.srcObject = null
      }
    }
  }, [useVideoAsBackground])

  // Modify initializeCamera to connect with CAMMICApp
  const initializeCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !selectedDevice) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: selectedDevice } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Connect stream to CAMMICApp if initialized
        if (cammicRef.current) {
          cammicRef.current.setVideoStream(stream);
        }
      }
      if (backgroundVideoRef.current && useVideoAsBackground) {
        backgroundVideoRef.current.srcObject = stream
      }
    } catch (e) {
      console.error('Error initializing camera:', e)
    }
  }, [selectedDevice, useVideoAsBackground])

  useEffect(() => {
    initializeCamera()
  }, [initializeCamera])


  const handleRotateCamera = useCallback(() => {
    if (!navigator.mediaDevices || devices.length < 2) return
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDevice)
    const nextIndex = (currentIndex + 1) % devices.length
    const newDevice = devices[nextIndex].deviceId
    console.log('Current device:', selectedDevice)
    console.log('New device:', newDevice)
    setSelectedDevice(newDevice)
  }, [devices, selectedDevice])

  
  useEffect(() => {
    console.log('Selected device changed:', selectedDevice)
    //fetchWebcamImage();
    const json_d = fetchImageInfo();
    console.log('Fetched file info:', json_d);

    const interval = setInterval(() => {
      if (showWebcam) {
        fetchWebcamImage();
      }
    }, 5000); // 3 FPS
//  }, 1000); // 1 FPS
//  }, 1000/30); // 30 FPS

    return () => clearInterval(interval);
  }, [selectedDevice, showWebcam])
  

  const handleCapture = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current!.videoWidth
    canvas.height = videoRef.current!.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoRef.current!, 0, 0)
    const data = canvas.toDataURL('image/png')

    if (data !== '') {
      console.log('capture')
      homeStore.setState({
        modalImage: data,
        triggerShutter: false, // シャッターをリセット
      })
    } else {
      homeStore.setState({ modalImage: '' })
    }
  }, [])

  useEffect(() => {
    if (triggerShutter) {
      handleCapture()
    }
  }, [triggerShutter, handleCapture])

// データ取得・更新処理
useEffect(() => {
  const updateApiData = async () => {
    const json_d = await fetchImageInfo();
    if (json_d) {
      setApiData({
        imageUrl: json_d.imageurl || '',
        timestamp: json_d.timestamp || '',
        age: json_d.age || '',
        gender: json_d.gender || '',
        mood: json_d.mood || '',
        recognizestate: json_d.recognizestate || '',
        recognizedname: json_d.recognizedname || ''
      });
    }
  };

  if (showWebcam) {
    updateApiData();
    const interval = setInterval(updateApiData, 1000);
    return () => clearInterval(interval);
  }
}, [showWebcam]);

// fetchWebcamImage関数のログを強化
const fetchWebcamImage = async () => {
  console.log('=== fetchWebcamImage started ===');
  setIsLoading(true);
  setError(null);
  
  try {
    const imageUrl = await fetchImageFile();
    console.log('Fetched image URL:', imageUrl);
    
    if (imageUrl && videoRef.current) {
      // img要素を作成してビデオ要素に表示
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        
        if (videoRef.current) {
          videoRef.current.style.backgroundImage = `url(${imageUrl})`;
          videoRef.current.style.backgroundSize = 'cover';
        }
      };
    }
  } catch (err) {
    console.error('Error in fetchWebcamImage:', err);
    setError('Failed to fetch webcam image');
  } finally {
    setIsLoading(false);
    console.log('=== fetchWebcamImage completed ===');
  }
};

  return (
    <>
      {useVideoAsBackground && (
        <video
          ref={backgroundVideoRef}
          autoPlay
          playsInline
          muted
          className="fixed top-0 left-0 w-full h-full object-cover -z-10"
        />
      )}
      <div className="absolute row-span-1 flex right-0 max-h-[40vh] z-10">
        <div className="relative w-full md:max-w-[512px] max-w-[70%] m-16 md:m-16 ml-auto">
          <video
            ref={videoRef}
            width={512}
            height={512}
            id="local-video" 
            className={`rounded-8 w-auto object-contain max-h-[100%] ml-auto ${
              useVideoAsBackground ? 'invisible' : ''
            }`}
            style={{ background: '#000' }} // 背景を黒に
          />
          {/* APIデータ表示 */}
          <div className="absolute top-0 left-0 p-2 bg-black/50 text-white">
            <p>Time: {apiData.timestamp}</p>
            <p>Age: {apiData.age}</p>
            <p>Gender: {apiData.gender}</p>
            <p>Mood: {apiData.mood}</p>
            <p>State: {apiData.recognizestate}</p>
            <p>Name: {apiData.recognizedname}</p>
          </div>
          {/* カメラ切り替えボタン */}  
          <div className="md:block absolute top-4 right-4">
            <IconButton
              iconName="24/Roll"
              className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled m-8"
              isProcessing={false}
              disabled={!showRotateButton}
              onClick={handleRotateCamera}
            />
            {/* シャッターボタン */}
            <IconButton
              iconName="24/Shutter"
              className="z-30 bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled m-8"
              isProcessing={false}
              onClick={fetchWebcamImage}
            />
          </div>
        </div>
      </div>
      <MessageInputContainer initialTranscript={currentTranscript} />
      {isLoading && <div>Loading...</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}
