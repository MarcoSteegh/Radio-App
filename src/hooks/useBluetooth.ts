import { useState, useCallback } from 'react'

type BluetoothLike = {
  requestDevice: (options: {
    acceptAllDevices: boolean
    optionalServices?: string[]
  }) => Promise<{ name?: string }>
}

type BluetoothNavigator = Navigator & {
  bluetooth?: BluetoothLike
}

export function useBluetooth() {
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string | null>(null)
  const [bluetoothError, setBluetoothError] = useState<string | null>(null)
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false)

  const connectBluetoothDevice = useCallback(async () => {
    const nav = navigator as BluetoothNavigator
    if (!nav.bluetooth) {
      setBluetoothError('Web Bluetooth wordt niet ondersteund in deze browser.')
      return
    }

    if (!window.isSecureContext) {
      setBluetoothError('Bluetooth werkt alleen via HTTPS of localhost.')
      return
    }

    setBluetoothError(null)
    setIsBluetoothConnecting(true)

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
      })

      setBluetoothDeviceName(device.name || 'Onbekend apparaat')
    } catch {
      setBluetoothError('Bluetooth koppelen geannuleerd of mislukt.')
    } finally {
      setIsBluetoothConnecting(false)
    }
  }, [])

  return {
    bluetoothDeviceName,
    bluetoothError,
    isBluetoothConnecting,
    connectBluetoothDevice,
  }
}
