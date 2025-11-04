from diagrams import Diagram, Cluster, Edge
from diagrams.aws.general import Users, General
from diagrams.aws.network import CloudFront, APIGateway
from diagrams.aws.storage import S3
from diagrams.aws.security import Cognito
from diagrams.aws.compute import Lambda
from diagrams.aws.integration import Eventbridge, StepFunctions
from diagrams.aws.management import Cloudwatch
from diagrams.aws.database import Dynamodb
from diagrams.aws.analytics import Athena
from diagrams.aws.cost import CostAndUsageReport


def main() -> None:
    # Custom node for numbered circles
    class FlowNumber(General):
        _provider = "aws"
        _icon_dir = "resources/aws/general"
        fontcolor = "#FFFFFF"

        def __init__(self, label, **attrs):
            attrs.setdefault("style", "filled")
            attrs.setdefault("fillcolor", "#333333")
            attrs.setdefault("shape", "circle")
            attrs.setdefault("width", "0.6")
            attrs.setdefault("height", "0.6")
            attrs.setdefault("fontsize", "12")
            super().__init__(label, **attrs)

    with Diagram(
        "",
        show=False,
        filename="images/aws-style-architecture",
        outformat="png",
        graph_attr={
            "bgcolor": "transparent",
            "rankdir": "TB",
            "pad": "0.5",
            "nodesep": "0.8",
            "ranksep": "1.2",
            "splines": "ortho",
        },
        node_attr={"fontsize": "10"},
    ):
        user = Users("Users")

        with Cluster("AWS Cloud"):
            with Cluster("Web UI component"):
                n1 = FlowNumber("1")
                n2 = FlowNumber("2")
                cf = CloudFront("Amazon CloudFront")
                s3_frontend = S3("S3 WebUIBucket")
                cognito = Cognito("Amazon Cognito")
                user >> n1 >> cf >> s3_frontend
                user >> n2 >> cognito

            with Cluster("API & Document Storage"):
                n3 = FlowNumber("3")
                n4 = FlowNumber("4")
                n5 = FlowNumber("5")
                n6 = FlowNumber("6")
                apigw = APIGateway("API Gateway")
                upload_lambda = Lambda("Upload Lambda")
                s3_docs = S3("S3 DocumentsBucket")

            with Cluster("Processing component"):
                n7 = FlowNumber("7")
                n8 = FlowNumber("8")
                n9 = FlowNumber("9")
                n10 = FlowNumber("10")
                n11 = FlowNumber("11")
                evb = Eventbridge("EventBridge")
                sfn = StepFunctions("Step Functions")
                
            with Cluster("Data & Search component"):
                n12 = FlowNumber("12")
                search_lambda = Lambda("Search Lambda")
                ddb_meta = Dynamodb("DynamoDB\nMetadata Table")
                ddb_hash = Dynamodb("Hash Registry")
                
            with Cluster("Observability"):
                n13 = FlowNumber("13")
                cw = Cloudwatch("CloudWatch Logs")

            # Frontend Flow
            cf >> n3 >> apigw
            apigw >> Edge(style="dashed") >> cognito
            apigw >> n4 >> upload_lambda
            upload_lambda >> Edge(label="presigned URL") >> user
            user >> n5 >> s3_docs

            # Backend Processing Flow
            s3_docs >> n6 >> evb >> sfn
            
            sfn >> n7 >> Lambda("Check Duplicate") >> ddb_hash
            sfn >> n8 >> Lambda("Textract") >> General("Amazon Textract")
            sfn >> n9 >> Lambda("Comprehend") >> General("Amazon Comprehend")
            sfn >> n10 >> Lambda("Bedrock") >> General("Amazon Bedrock")
            sfn >> n11 >> Lambda("Store Metadata") >> ddb_meta
            
            # Search Flow
            apigw >> n12 >> search_lambda >> ddb_meta

            # Invisible edges for alignment
            s3_frontend >> Edge(style="invis") >> s3_docs
            upload_lambda >> Edge(style="invis") >> evb
            
            # Logging
            sfn >> n13 >> cw
            apigw >> n13
            
if __name__ == "__main__":
    main()


