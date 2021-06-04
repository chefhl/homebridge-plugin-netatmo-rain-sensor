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
  private readonly pollingInterval: number;
  private netatmoApi: netatmo;
  private netatmoStationId?: string;
  private netatmoRainSensorId?: string;
  private rainDetected: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig, api: API) {
    this.logging = logging;
    this.netatmoStationId = undefined;
    this.netatmoRainSensorId = undefined;
    this.rainDetected = false;
    this.pollingInterval = accessoryConfig.pollingInterval;
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

    api.on('didFinishLaunching', this.afterLaunch);
  }

  afterLaunch() {
    // Check for existence of Netatmo rain sensor
    this.netatmoApi.getStationsData();
  }

  getDevices(_error, devices): void {
    //this.logging.debug('getDevices called');
    devices.array.forEach(device => {
      device.modules.array.forEach(module => {
        if(module.type === 'NAModule3') {
          this.logging.debug(`Found at least one Netatmo Rain Sensor named ${module.module_name}`);
          this.netatmoStationId = device._id;
          this.netatmoRainSensorId = module._id;
        }
      });
    });
    if(this.netatmoRainSensorId !== undefined) {
      // Create recurring timer for Netatmo API polling
      const pollingIntervalInMs = this.pollingInterval;
      this.logging.debug(`Setting Netatmo API polling interval to ${pollingIntervalInMs} ms`);
      setInterval(this.pollNetatmoApi, pollingIntervalInMs);
    } else {
      this.logging.error('No Netatmo Rain Sensor found.');
    }
  }

  getMeasures(_error, measures): void {
    this.logging.debug('getMeasures called');
    let rainAmount = 0;
    measures.value.array.forEach(measuredValue => {
      rainAmount += measuredValue[0];
    });
    if(rainAmount > 0) {
      this.rainDetected = true;
      this.leakSensorService.updateCharacteristic(hap.Characteristic.LeakDetected, hap.Characteristic.LeakDetected.LEAK_DETECTED);
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

    netatmoApi.on('error', this.handleNetatmoApiError);

    netatmoApi.on('warning', this.handleNetatmoApiWarning);

    netatmoApi.on('get-stationsdata', this.getDevices);

    netatmoApi.on('get-measure', this.getMeasures);

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
    const thirtyMinutesInMillis = 30 * 60 * 1000;
    const options = {
      device_id: this.netatmoStationId,
      module_id: this.netatmoRainSensorId,
      scale: '30min',
      type: ['rain'],
      date_begin: new Date(now - thirtyMinutesInMillis).getTime(),
      date_end: now,
      optimize: true,
      real_time: true,
    };
    this.netatmoApi.getMeasure(options);
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.leakSensorService,
    ];
  }

  handleStatusActiveGet(): boolean {
    this.logging.debug('Homebridge triggered StatusActiveGet');
    return true;
  }

  handleLeakDetectedGet(): number {
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