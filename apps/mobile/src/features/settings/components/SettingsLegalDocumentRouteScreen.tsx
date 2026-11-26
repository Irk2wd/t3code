import { useNavigation } from "@react-navigation/native";
import { useGT } from "gt-react-native";
import { View } from "react-native";
import { Button } from "../../../components/ui/Button";
import { AppText } from "../../../components/ui/AppText";
import { SheetHeader } from "../../../components/ui/SheetHeader";
import { tryOpenExternalUrl } from "../../../lib/openExternalUrl";
import { isLegalDocumentUrl } from "../lib/legal-document-url";

export function SettingsLegalDocumentRouteScreen(props: {
  readonly documentName: string;
  readonly documentUrl: string;
}) {
  const navigation = useNavigation();
  const gt = useGT();
  return (
    <View className="flex-1 bg-sheet">
      <SheetHeader
        title={props.documentName}
        accessibilityLabel={gt("Close legal document")}
        onClose={() => navigation.goBack()}
      />
      {isLegalDocumentUrl(props.documentUrl) ? (
        <View className="gap-3 p-6">
          <AppText selectable>{props.documentUrl}</AppText>
          <Button
            label={gt("Open in Browser")}
            onPress={() => void tryOpenExternalUrl(props.documentUrl)}
          />
        </View>
      ) : null}
    </View>
  );
}
