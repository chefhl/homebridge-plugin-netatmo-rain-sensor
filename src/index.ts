import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';

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
  private readonly slidingWindowSizeInMinutes: number;
  private netatmoApi: netatmo;
  private netatmoStationId?: string;
  private netatmoRainSensorId?: string;
  private rainDetected: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig) {
    this.logging = logging;
    this.netatmoStationId = undefined;
    this.netatmoRainSensorId = undefined;
    this.rainDetected = false;
    this.pollingIntervalInSec = accessoryConfig.pollingInterval;
    this.slidingWindowSizeInMinutes = accessoryConfig.slidingWindowSize;

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

    this.logging.info('Authenticating with the Netatmo API and configuring callbacks.');
    this.netatmoApi = this.authenticateAndConfigureNetatmoApi(accessoryConfig);

    this.logging.info('Looking for Netatmo Rain Sensor and setting up polling schedule.');
    this.netatmoApi.getStationsData();
  }

  getDevices(_error, devices): void {
    devices.forEach(device => {
      device.modules.forEach(module => {
        if(module.type === 'NAModule3') {
          this.logging.info(`Found first Netatmo Rain Sensor named "${module.module_name}". Using this Rain Sensor.`);
          this.netatmoStationId = device._id;
          this.netatmoRainSensorId = module._id;
        }
      });
    });
    if(this.netatmoRainSensorId !== undefined) {
      // Create recurring timer for Netatmo API polling
      const pollingIntervalInMs = this.pollingIntervalInSec * 1000;
      this.logging.debug(`Setting Netatmo API polling interval to ${pollingIntervalInMs}ms.`);
      setInterval(this.pollNetatmoApi.bind(this), pollingIntervalInMs);
      this.pollNetatmoApi();
    } else {
      this.logging.error('No Netatmo Rain Sensor found.');
    }
  }

  getMeasures(_error, measures): void {
    this.logging.debug(`Native output of measures: ${JSON.stringify(measures)}.`);

    this.rainDetected = false;

    measures.forEach(measure => {
      measure.value.forEach(measuredValue => {
        if(measuredValue > 0) {
          this.rainDetected = true;
        }
      });
    });

    this.leakSensorService.updateCharacteristic(hap.Characteristic.LeakDetected, this.handleLeakDetectedGet());
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
    this.logging.error(`Netatmo API error: ${errorMessage}.`);
  }

  handleNetatmoApiWarning(warningMessage: string): void {
    this.logging.warn(`Netatmo API warning: ${warningMessage}.`);
  }

  pollNetatmoApi(): void {
    this.logging.debug('Polling the Netatmo API.');
    const now = new Date().getTime();
    const slidingWindowSizeInMillis = this.slidingWindowSizeInMinutes * 60 * 1000;
    this.logging.debug(`Sliding window size in milliseconds: ${slidingWindowSizeInMillis}.`);
    const options = {
      device_id: this.netatmoStationId,
      module_id: this.netatmoRainSensorId,
      scale: '30min',
      type: ['rain'],
      date_begin: Math.floor(new Date(now - slidingWindowSizeInMillis).getTime()/1000),
      optimize: true,
      real_time: true,
    };
    this.logging.debug(`Native output of request options: ${JSON.stringify(options)}.`);
    this.netatmoApi.getMeasure(options);
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.leakSensorService,
    ];
  }

  handleStatusActiveGet(): boolean {
    // Accessory is always active
    return true;
  }

  handleLeakDetectedGet(): number {
    if(this.rainDetected) {
      this.logging.debug('Rain detected!');
      return hap.Characteristic.LeakDetected.LEAK_DETECTED;
    } else {
      this.logging.debug('No rain detected.');
      return hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    }
  }
}