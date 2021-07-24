import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import netatmo from 'netatmo';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('homebridge-plugin-netatmo-rain-sensor', VirtualRainSensorPlugin);
};

enum VirtualRainSensorDeviceType {
  Switch,
  Leak
}

class VirtualRainSensorPlugin implements AccessoryPlugin {
  private readonly logging: Logging;
  private readonly virtualRainSensorService: Service;
  private readonly accessoryInformationService: Service;
  private readonly deviceType: VirtualRainSensorDeviceType;
  private readonly pollingIntervalInSec: number;
  private readonly slidingWindowSizeInMinutes: number;
  private readonly reauthenticationIntervalInMs: number;
  private readonly cooldownIntervalInMinutes: number;
  private netatmoApi: netatmo;
  private netatmoStationId?: string;
  private netatmoRainSensorId?: string;
  private rainDetected: boolean;
  private readonly accessoryConfig: AccessoryConfig;
  private IsInCooldown: boolean;

  constructor(logging: Logging, accessoryConfig: AccessoryConfig) {
    this.logging = logging;
    this.accessoryConfig = accessoryConfig;
    this.netatmoStationId = undefined;
    this.netatmoRainSensorId = undefined;
    this.rainDetected = false;
    this.deviceType = this.initializeDeviceType(accessoryConfig.deviceType);
    this.virtualRainSensorService = this.createAndConfigureService(this.deviceType);
    this.pollingIntervalInSec = accessoryConfig.pollingInterval;
    this.slidingWindowSizeInMinutes = accessoryConfig.slidingWindowSize;
    this.cooldownIntervalInMinutes = accessoryConfig.cooldownInterval;
    this.IsInCooldown = false;

    // Reauthenticate Netatmo API every 24 hours
    this.reauthenticationIntervalInMs = 24 * 60 * 60 * 1000;

    // Create a new Accessory Information Service
    this.accessoryInformationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Patrick Bär')
      .setCharacteristic(hap.Characteristic.Model, 'Virtual Device for Netatmo Rain Sensor');

    this.logging.info('Authenticating with the Netatmo API and configuring callbacks.');
    this.netatmoApi = this.authenticateAndConfigureNetatmoApi(accessoryConfig);

    this.logging.info('Looking for Netatmo Rain Sensor and setting up polling schedule.');
    this.netatmoApi.getStationsData();
  }

  createAndConfigureService(deviceType: VirtualRainSensorDeviceType): Service {
    let localVirtualRainSensorService: Service;

    if(deviceType === VirtualRainSensorDeviceType.Switch) {
      // Create a new Switch Sensor Service
      localVirtualRainSensorService = new hap.Service.Switch(this.accessoryConfig.name);

      // Create handler for rain detection
      localVirtualRainSensorService.getCharacteristic(hap.Characteristic.On)
        .onGet(this.handleSwitchOnGet.bind(this));
      localVirtualRainSensorService.getCharacteristic(hap.Characteristic.On)
        .onSet(this.handleSwitchOnSet.bind(this));

      this.logging.info('Exposing the Netatmo Rain Sensor as a Switch.');
    } else {
      // Create a new Leak Sensor Service
      localVirtualRainSensorService = new hap.Service.LeakSensor(this.accessoryConfig.name);

      // Create handler for leak detection
      localVirtualRainSensorService.getCharacteristic(hap.Characteristic.LeakDetected)
        .onGet(this.handleLeakDetectedGet.bind(this));

      this.logging.info('Exposing the Netatmo Rain Sensor as a Leak Sensor.');
    }

    return localVirtualRainSensorService;
  }

  initializeDeviceType(deviceTypeAsString: string): VirtualRainSensorDeviceType {
    if(deviceTypeAsString === 'Switch') {
      return VirtualRainSensorDeviceType.Switch;
    } else {
      return VirtualRainSensorDeviceType.Leak;
    }
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
      // Create recurring timer for Netatmo API reauthentication
      setInterval(this.forceReauthenticationOfNetatmoApi.bind(this), this.reauthenticationIntervalInMs);

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

    if(this.IsInCooldown) {
      this.logging.debug('Cooldown detected. Skipping this rain detection cycle.');
    } else {
      this.rainDetected = false;

      measures.forEach(measure => {
        measure.value.forEach(measuredValue => {
          if(measuredValue > 0) {
            this.rainDetected = true;
          }
        });
      });

      if(this.deviceType === VirtualRainSensorDeviceType.Switch) {
        this.handleSwitchOnSet(this.handleSwitchOnGet());
      } else {
        this.virtualRainSensorService.updateCharacteristic(hap.Characteristic.LeakDetected, this.handleLeakDetectedGet());
      }
    }
  }

  endCooldown(): void {
    this.IsInCooldown = false;
    this.logging.debug('Cooldown ended');
  }

  forceReauthenticationOfNetatmoApi(): void {
    this.logging.debug('Reauthenticating Netatmo API');
    this.shutdownNetatmoApi(this.netatmoApi);
    this.netatmoApi = this.authenticateAndConfigureNetatmoApi(this.accessoryConfig);
  }

  shutdownNetatmoApi(netatmoApi: netatmo): void {
    netatmoApi.removeAllListeners();
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
    if(this.IsInCooldown) {
      this.logging.debug('Cooldown detected. Skipping this rain detection cycle.');
    } else {
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
  }

  getServices(): Service[] {
    return [
      this.accessoryInformationService,
      this.virtualRainSensorService,
    ];
  }

  scheduleSwitchReset(): void {
    if(this.deviceType === VirtualRainSensorDeviceType.Switch) {
      setTimeout(() => this.handleSwitchOnSet(false), 500);
    }
  }

  handleLeakDetectedGet(): number {
    if(this.handleSwitchOnGet()) {
      return hap.Characteristic.LeakDetected.LEAK_DETECTED;
    } else {
      return hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    }
  }

  handleSwitchOnGet(): boolean {
    if(this.IsInCooldown) {
      this.logging.debug('Rain detected is false during cooldown.');
      return false;
    } else {
      if(this.rainDetected) {
        this.logging.info('Rain detected!');

        if(this.cooldownIntervalInMinutes > 0) {
          const cooldownIntervalInMs = this.cooldownIntervalInMinutes * 60 * 1000;

          this.logging.debug(`Entering cooldown of ${cooldownIntervalInMs}ms.`);
          this.IsInCooldown = true;

          setTimeout(this.endCooldown.bind(this), cooldownIntervalInMs);
        }

        this.scheduleSwitchReset();
        return true;
      } else {
        this.logging.debug('No rain detected.');
        return false;
      }
    }
  }

  // value is type boolean for the switch service
  handleSwitchOnSet(value: CharacteristicValue): void {
    if(value) {
      this.logging.debug('Turn switch on.');
      this.scheduleSwitchReset();
    } else {
      this.logging.debug('Turn switch off.');
    }

    this.virtualRainSensorService.updateCharacteristic(hap.Characteristic.On, value);
  }
}