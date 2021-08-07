# Version History
All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).
## 2.2.0 (2021-08-06)
+ It is now possible to specify the serial number of a specific rain sensor. Thus multiple rain sensors can be tracked as well.
## 2.1.0 (2021-07-26)
+ It is now possible to configure if the Netatmo Rain Sensor is represented as a Switch or a Leak Sensor in HomeKit with "Switch" being the default.
## 2.0.0 (2021-07-19)
+ Changed the Netatmo Rain Sensor representation to "Switch" to prevent iOS integrated "Leak Sensor" alerts. Introduced a configurable "Cooldown perdiod" to prevent API polling and rain detection for a certain amount of time after rain was detected.
## 1.0.6 (2021-06-26)
+ First stable release that represents the Netatmo Rain Sensor as a "Leak Sensor".