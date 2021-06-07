import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';
//import { setInterval } from 'node:timers';
import netatmo from 'netatmo';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('homebridge-plugin-netatmo-rain-sensor', VirtualLeakSensor);
};

class VirtualLeakSensor implements AccessoryPlugin {
  private readonly logging: Logging;
  private readonly leakSensorService: Service;
  private readonly accessoryInformationService: Service;
  private readonly pollingIntervalInSec: number;
  private netatmoApi: netatmo;
  private netatmoStationId?: string;
  private netatmoRainSensorId?: string;
  private rainDetected: boolean;
  private isFullyInitialized: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig) {
    this.logging = logging;
    this.netatmoStationId = undefined;
    this.netatmoRainSensorId = undefined;
    this.rainDetected = false;
    this.pollingIntervalInSec = accessoryConfig.pollingInterval;
    this.isFullyInitialized = false;

    this.logging.debug('Constructing virtual leak sensor');

    // Create a new Leak Sensor Service
    this.leakSensorService = new hap.Service.LeakSensor(accessoryConfig.name);

    // Create a new Accessory Information Service
    this.accessoryInformationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Patrick Bär')
      .setCharacteristic(hap.Characteristic.Model, 'Virtual Leak Sensor for Netatmo Rain Sensor');

    // Create handler for leak detection
    this.leakSensorService.getCharacteristic(hap.Characteristic.LeakDetected)
      .onGet(this.handleLeakDetectedGet.bind(this));
    this.leakSensorService.getCharacteristic(hap.Characteristic.StatusActive)
      .onGet(this.handleStatusActiveGet.bind(this));

    // Authenticate with the Netatmo API and configure callbacks
    this.netatmoApi = this.authenticateAndConfigureNetatmoApi(accessoryConfig);
  }

  getDevices(_error, devices): void {
    this.logging.debug('getDevices called');
    devices.forEach(device => {
      device.modules.forEach(module => {
        if(module.type === 'NAModule3') {
          this.logging.debug(`Found at least one Netatmo Rain Sensor named ${module.module_name}`);
          this.netatmoStationId = device._id;
          this.netatmoRainSensorId = module._id;
        }
      });
    });
    if(this.netatmoRainSensorId !== undefined) {
      // Create recurring timer for Netatmo API polling
      const pollingIntervalInMs = this.pollingIntervalInSec * 1000;
      this.logging.debug(`Setting Netatmo API polling interval to ${pollingIntervalInMs} ms`);
      setInterval(this.pollNetatmoApi.bind(this), pollingIntervalInMs);
    } else {
      this.logging.error('No Netatmo Rain Sensor found.');
    }
  }

  getMeasures(_error, measures): void {
    this.logging.debug('getMeasures called');
    this.logging.debug(`Native output of measures ${JSON.stringify(measures)}`);
    let rainAmount = 0;
    measures.forEach(measure => {
      measure.value[0].forEach(measuredValue => {
        rainAmount += measuredValue[0];
      });
    });

    if(rainAmount > 0) {
      this.rainDetected = true;
      this.leakSensorService.updateCharacteristic(hap.Characteristic.LeakDetected, this.handleLeakDetectedGet());
    }
  }

  authenticateAndConfigureNetatmoApi(accessoryConfig: AccessoryConfig): netatmo {
    const auth = {
      'client_id': accessoryConfig.netatmoClientId,
      'client_secret': accessoryConfig.netatmoClientSecret,
      'username': accessoryConfig.netatmoUsername,
      'password': accessoryConfig.netatmoPassword,
    };

    const netatmoApi = new netatmo(auth);

    netatmoApi.on('error', this.handleNetatmoApiError.bind(this));

    netatmoApi.on('warning', this.handleNetatmoApiWarning.bind(this));

    netatmoApi.on('get-stationsdata', this.getDevices.bind(this));

    netatmoApi.on('get-measure', this.getMeasures.bind(this));

    return netatmoApi;
  }

  handleNetatmoApiError(errorMessage: string): void {
    this.logging.error(`Netatmo API error: ${errorMessage}`);
  }

  handleNetatmoApiWarning(warningMessage: string): void {
    this.logging.warn(`Netatmo API warning: ${warningMessage}`);
  }

  pollNetatmoApi(): void {
    this.logging.debug('Polling the Netatmo API');
    const now = new Date().getTime();
    const fortyMinutesInMillis = 40 * 60 * 1000;
    const options = {
      device_id: this.netatmoStationId,
      module_id: this.netatmoRainSensorId,
      scale: '30min',
      type: ['rain'],
      date_begin: Math.floor(new Date(now - fortyMinutesInMillis).getTime()/1000),
      optimize: true,
      real_time: true,
    };
    this.logging.debug(JSON.stringify(options));
    this.netatmoApi.getMeasure(options);
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.leakSensorService,
    ];
  }

  handleStatusActiveGet(): boolean {
    this.logging.debug('Homebridge triggered StatusActiveGet. Always returns true');
    return true;
  }

  handleLeakDetectedGet(): number {
    if(!this.isFullyInitialized) {
      this.logging.debug('Homebridge triggered LeakDetectedGet for the first time');
      this.logging.debug('Looking for Netatmo Rain Sensor and setup polling schedule');
      this.netatmoApi.getStationsData();
    }

    this.logging.debug('Homebridge ot Netatmo polling triggered LeakDetectedGet');

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