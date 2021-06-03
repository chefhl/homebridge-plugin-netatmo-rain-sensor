import {
  AccessoryConfig,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';
import { setInterval } from 'node:timers';
import netatmo from 'netatmo';

let hap: HAP;

module.exports = (api: API) => {
  api.registerAccessory('Virtual Leak Sensor for Netatmo Rain Sensor', VirtualLeakSensor);
};

class VirtualLeakSensor {
  private readonly logging: Logging;
  private readonly accessoryConfigName: string;
  private readonly leakSensorService: Service;
  private readonly accessoryInformationService;
  private readonly netatmoApi: netatmo;
  private rainDetected: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig) {
    this.logging = logging;
    this.accessoryConfigName = accessoryConfig.name;

    this.rainDetected = false;

    // Create a new Leak Sensor Service
    this.leakSensorService = new hap.Service.LeakSensor(this.accessoryConfigName);

    // Create a new Accessory Information Service
    this.accessoryInformationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Patrick Bär')
      .setCharacteristic(hap.Characteristic.Model, 'Virtual Leak Sensor for Netatmo Rain Sensor');

    // Create handler for leak detection
    this.leakSensorService.getCharacteristic(hap.Characteristic.LeakDetected)
      .onGet(this.handleLeakDetectedGet.bind(this));

    // Authenticate with the Netatmo API
    this.netatmoApi = this.authenticateNetatmo(accessoryConfig);

    // Create recurring timer for Netatmo API polling
    const pollingIntervalInMs = accessoryConfig.pollingInterval;
    this.logging.debug('Setting Netatmo API polling interval to %d ms', pollingIntervalInMs);
    setInterval(this.pollNetatmoApi, pollingIntervalInMs);
  }

  authenticateNetatmo(accessoryConfig: AccessoryConfig): netatmo {
    const auth = {
      'client_id': accessoryConfig.netatmoClientId,
      'client_secret': accessoryConfig.netatmoClientSecret,
      'username': accessoryConfig.netatmoUsername,
      'password': accessoryConfig.netatmoPassword,
    };

    const api = new netatmo(auth);

    return api;
  }

  pollNetatmoApi() {
    this.logging.debug('Polling the Netatmo API');
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.leakSensorService,
    ];
  }

  handleLeakDetectedGet() {
    this.logging.debug('Homebridge triggered LeakDetectedGet');

    if(this.rainDetected) {
      this.logging.debug('Rain detected!');

      // Reset rain detection state until next Netatmo API polling
      this.rainDetected = false;
      return hap.Characteristic.LeakDetected.LEAK_DETECTED;
    } else {
      this.logging.debug('No rain detected');
      return hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    }
  }
}