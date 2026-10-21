import { accessStatus } from './authorization';
import { resolver } from './registry';

resolver.define('getAuthStatus', ({ context }) => accessStatus(context));
