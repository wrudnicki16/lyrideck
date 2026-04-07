import React from 'react';
import { Text } from 'react-native';

const createIconSet = (name: string) => {
  const Icon = ({ testID, ...props }: any) => (
    <Text testID={testID}>{name}</Text>
  );
  Icon.displayName = name;
  return Icon;
};

export const Ionicons = createIconSet('Ionicons');
export const FontAwesome = createIconSet('FontAwesome');
export const MaterialIcons = createIconSet('MaterialIcons');
export const Feather = createIconSet('Feather');
export const AntDesign = createIconSet('AntDesign');
export const Entypo = createIconSet('Entypo');
export const EvilIcons = createIconSet('EvilIcons');
export const FontAwesome5 = createIconSet('FontAwesome5');
export const FontAwesome6 = createIconSet('FontAwesome6');
export const Fontisto = createIconSet('Fontisto');
export const Foundation = createIconSet('Foundation');
export const MaterialCommunityIcons = createIconSet('MaterialCommunityIcons');
export const Octicons = createIconSet('Octicons');
export const SimpleLineIcons = createIconSet('SimpleLineIcons');
export const Zocial = createIconSet('Zocial');
