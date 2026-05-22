import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Deep-link / Web URL configuration.
 *
 * Per spec the same hierarchy must be used on Web and Android. The Web URL
 * paths therefore mirror the spec exactly:
 *   /machines
 *   /machines/:machineId
 *   /machines/:machineId/agents/:agentType
 *   /machines/:machineId/actions/:actionId
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['agentmanager://', 'http://localhost:8081/', 'https://localhost/'],
  config: {
    screens: {
      Login: 'login',
      Main: {
        screens: {
          MachinesTab: {
            initialRouteName: 'Machines',
            screens: {
              Machines: 'machines',
              MachineDetail: 'machines/:machineId',
              AgentDetail: 'machines/:machineId/agents/:agentType',
              ActionResult: 'machines/:machineId/actions/:actionId',
            },
          },
          SettingsTab: {
            screens: {
              Settings: 'settings',
            },
          },
        },
      },
    },
  },
};
