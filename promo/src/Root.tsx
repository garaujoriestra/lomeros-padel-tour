import { Composition } from 'remotion';
import { Promo, DURATION, FPS, promoDefaultProps } from './Promo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={promoDefaultProps}
    />
  );
};
