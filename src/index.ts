import {
  AccessoryConfig,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';
import { setInterval } from 'node:timers';

let hap: HAP;

module.exports = (api: API) => {
  api.registerAccessory('Virtual Leak Sensor for Netatmo Rain Sensor', VirtualLeakSensor);
};

class VirtualLeakSensor {
  private readonly api: API;
  private readonly logging: Logging;
  private readonly accessoryConfigName: string;
  private readonly leakSensorService: Service;
  private readonly accessoryInformationService;
  private leakDetected: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig, api: API) {
    this.logging = logging;
    this.api = api;
    this.accessoryConfigName = accessoryConfig.name;

    this.leakDetected = false;

    // Create a new Leak Sensor Service
    this.leakSensorService = new hap.Service.LeakSensor(this.accessoryConfigName);

    // Create a new Accessory Information Service
    this.accessoryInformationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Patrick Bär')
      .setCharacteristic(hap.Characteristic.Model, 'Virtual Leak Sensor for Netatmo Rain Sensor');

    // Create handler for leak detection
    this.leakSensorService.getCharacteristic(hap.Characteristic.LeakDetected)
      .onGet(this.handleLeakDetectedGet.bind(this));

    // Create recurring timer for Netatmo API polling
    const pollingIntervalInMs = accessoryConfig.pollingInterval;
    this.logging.debug('Setting Netatmo API polling interval to %d ms', pollingIntervalInMs);
    setInterval(this.pollNetatmoApi, pollingIntervalInMs);
  }

  pollNetatmoApi(): void {
    this.logging.debug('Polling the Netatmo API');
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.leakSensorService,
    ];
  }

  /**
   * Handle requests to get the current value of the "Leak Detected" characteristic
   */
  handleLeakDetectedGet() {
    this.logging.debug('Triggered GET LeakDetected');

    // set this to a valid value for LeakDetected
    const currentValue = hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;

    return currentValue;
  }
}